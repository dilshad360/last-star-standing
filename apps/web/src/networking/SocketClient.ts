import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ControllerJoinAck,
  HostAck,
  PlayerInput,
  ServerToClientEvents,
  SimpleAck,
} from '@lss/shared';
import { gameEvents } from '../game/EventBus.js';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** What this tab is in a room as, so it can re-attach after a reconnect. */
type Session =
  | { role: 'host'; code: string; hostToken: string }
  | { role: 'controller'; code: string; displayName: string; playerToken: string };

const HOST_SESSION_KEY = 'lss_host_session';
const playerTokenKey = (code: string) => `lss_player_token_${code}`;

/**
 * Socket.IO client manager with auto-reconnect. Re-attaches the host screen
 * or phone controller to its room after a network blip, and forwards all
 * server events through the EventBus for Phaser/React.
 */
export class SocketClient {
  private socket: TypedSocket | null = null;
  private session: Session | null = null;

  connect(): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();
    if (this.socket) {
      const pending = this.socket;
      return new Promise((resolve) => pending.once('connect', () => resolve()));
    }

    return new Promise((resolve, reject) => {
      let serverUrl =
        (import.meta as unknown as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL ||
        undefined;
      if (serverUrl && !/^https?:\/\//.test(serverUrl)) serverUrl = `https://${serverUrl}`;
      const socket: TypedSocket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
      });
      this.socket = socket;
      let firstConnect = true;

      socket.on('connect', () => {
        gameEvents.emit('connection:status', { connected: true });
        if (firstConnect) {
          firstConnect = false;
          resolve();
        } else {
          void this.reattach();
        }
      });

      socket.on('disconnect', () => {
        gameEvents.emit('connection:status', { connected: false });
      });

      socket.on('connect_error', (err) => {
        gameEvents.emit('connection:status', { connected: false });
        if (firstConnect) reject(err);
      });

      socket.on('room:updated', (room) => gameEvents.emit('room:updated', room));
      socket.on('match:countdown', (payload) => gameEvents.emit('match:countdown', payload));
      socket.on('match:started', (payload) => gameEvents.emit('match:started', payload));
      socket.on('game:snapshot', (snapshot) => gameEvents.emit('snapshot:update', snapshot));
      socket.on('player:eliminated', (entry) => gameEvents.emit('player:eliminated', entry));
      socket.on('cosmic:event', (event) => gameEvents.emit('cosmic:event', event));
      socket.on('match:finished', (result) => gameEvents.emit('match:finished', result));
      socket.on('controller:state', (state) => gameEvents.emit('controller:state', state));
      socket.on('controller:haptic', (payload) => gameEvents.emit('controller:haptic', payload));
      socket.on('room:closed', (payload) => {
        this.clearSession();
        gameEvents.emit('room:closed', payload);
      });
      socket.on('room:error', (payload) => gameEvents.emit('error', { message: payload.message }));
    });
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ── Host screen ──────────────────────────────────────────────────────────

  /** Previously hosted room in this tab (survives a page refresh). */
  storedHostSession(): { code: string; hostToken: string } | null {
    try {
      const raw = sessionStorage.getItem(HOST_SESSION_KEY);
      return raw ? (JSON.parse(raw) as { code: string; hostToken: string }) : null;
    } catch {
      return null;
    }
  }

  async hostCreate(): Promise<HostAck> {
    await this.connect();
    const ack = await this.emitWithAck<HostAck>('host:create');
    if (ack.ok) this.setHostSession(ack.room.code, ack.hostToken);
    return ack;
  }

  async hostResume(code: string, hostToken: string): Promise<HostAck> {
    await this.connect();
    const ack = await this.emitWithAck<HostAck>('host:resume', { code, hostToken });
    if (ack.ok) this.setHostSession(ack.room.code, ack.hostToken);
    else this.clearSession();
    return ack;
  }

  // ── Phone controller ─────────────────────────────────────────────────────

  storedPlayerToken(code: string): string | null {
    return localStorage.getItem(playerTokenKey(code));
  }

  async controllerJoin(code: string, displayName: string): Promise<ControllerJoinAck> {
    await this.connect();
    const normalized = code.trim().toUpperCase();
    const ack = await this.emitWithAck<ControllerJoinAck>('controller:join', {
      code: normalized,
      displayName,
      playerToken: this.storedPlayerToken(normalized) ?? undefined,
    });
    if (ack.ok) {
      localStorage.setItem(playerTokenKey(ack.room.code), ack.playerToken);
      this.session = {
        role: 'controller',
        code: ack.room.code,
        displayName,
        playerToken: ack.playerToken,
      };
    }
    return ack;
  }

  // ── Room actions ─────────────────────────────────────────────────────────

  async leaveRoom(): Promise<SimpleAck> {
    if (this.session?.role === 'controller') {
      localStorage.removeItem(playerTokenKey(this.session.code));
    }
    this.clearSession();
    return this.emitWithAck('room:leave');
  }

  setBotCount(count: number): Promise<SimpleAck> {
    return this.emitWithAck('room:setBots', { count });
  }

  startMatch(): Promise<SimpleAck> {
    return this.emitWithAck('match:start');
  }

  restartMatch(): Promise<SimpleAck> {
    return this.emitWithAck('match:restart');
  }

  /**
   * Streams input. Button presses/releases are sent `reliable` so they are
   * never dropped; the 30 Hz stick stream is volatile (stale packets are useless).
   */
  sendInput(input: PlayerInput, reliable = false): void {
    if (!this.socket?.connected) return;
    if (reliable) this.socket.emit('input:update', input);
    else this.socket.volatile.emit('input:update', input);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private setHostSession(code: string, hostToken: string): void {
    this.session = { role: 'host', code, hostToken };
    sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify({ code, hostToken }));
  }

  private clearSession(): void {
    if (this.session?.role === 'host') sessionStorage.removeItem(HOST_SESSION_KEY);
    this.session = null;
  }

  private async reattach(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      const ack =
        session.role === 'host'
          ? await this.hostResume(session.code, session.hostToken)
          : await this.controllerJoin(session.code, session.displayName);
      if (ack.ok) gameEvents.emit('room:updated', ack.room);
      else gameEvents.emit('room:closed', { reason: ack.error });
    } catch (err) {
      gameEvents.emit('error', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  private emitWithAck<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to the game server.'));
        return;
      }
      const args = payload === undefined ? [] : [payload];
      (this.socket.timeout(5000) as unknown as {
        emit: (e: string, ...a: unknown[]) => void;
      }).emit(event, ...args, (err: Error | null, res: T) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }
}

/** Singleton socket client. */
export const socketClient = new SocketClient();
