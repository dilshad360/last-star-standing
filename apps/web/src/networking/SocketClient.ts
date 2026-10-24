import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  PlayerInput,
  ServerToClientEvents,
  SimpleAck,
  JoinAck,
  RoomInfo,
  GameSnapshot,
  KillFeedEntry,
  MatchResult,
  CosmicEventState,
  CountdownPayload,
} from '@lss/shared';
import { gameEvents } from '../game/EventBus.js';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Socket.IO client manager with auto-reconnect and latency measurement.
 * Emits all server events through the EventBus for consumption by Phaser/React.
 */
export class SocketClient {
  private socket: TypedSocket | null = null;

  connect(): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const serverUrl =
        (typeof import.meta !== 'undefined' &&
          (import.meta as unknown as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL) ||
        undefined;
      const socket: TypedSocket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this.socket = socket;

      socket.on('connect', () => {
        console.log('[socket] connected', socket.id);
        gameEvents.emit('connection:status', { connected: true });
        resolve();
      });

      socket.on('disconnect', (reason) => {
        console.log('[socket] disconnected', reason);
        gameEvents.emit('connection:status', { connected: false });
      });

      socket.on('connect_error', (err) => {
        console.error('[socket] connection error', err);
        gameEvents.emit('connection:status', { connected: false });
        reject(err);
      });

      // Forward all server events to the EventBus
      socket.on('room:updated', (room: RoomInfo) => gameEvents.emit('room:updated', room));
      socket.on('match:countdown', (payload: CountdownPayload) => gameEvents.emit('match:countdown', payload));
      socket.on('match:started', (payload: { snapshot: GameSnapshot }) => gameEvents.emit('match:started', payload));
      socket.on('game:snapshot', (snapshot: GameSnapshot) => {
        gameEvents.emit('snapshot:update', snapshot);
        // Estimate one-way latency from the embedded server clock.
        gameEvents.emit('connection:status', {
          connected: true,
          latencyMs: Math.max(0, Date.now() - snapshot.serverTime),
        });
      });
      socket.on('player:eliminated', (entry: KillFeedEntry) => gameEvents.emit('player:eliminated', entry));
      socket.on('cosmic:event', (event: CosmicEventState) => gameEvents.emit('cosmic:event', event));
      socket.on('match:finished', (result: MatchResult) => gameEvents.emit('match:finished', result));
      socket.on('room:closed', () => gameEvents.emit('error', { message: 'Room was closed' }));
      socket.on('room:error', (payload) => gameEvents.emit('error', { message: payload.message }));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get socketId(): string | undefined {
    return this.socket?.id;
  }

  // ── Room actions ─────────────────────────────────────────────────────────

  createRoom(displayName: string): Promise<JoinAck> {
    return this.emitWithAck('room:create', { displayName });
  }

  joinRoom(code: string, displayName: string): Promise<JoinAck> {
    return this.emitWithAck('room:join', { code, displayName });
  }

  quickPlay(displayName: string, botCount?: number): Promise<JoinAck> {
    return this.emitWithAck('room:quickPlay', { displayName, botCount });
  }

  leaveRoom(): Promise<SimpleAck> {
    return this.emitWithAck('room:leave');
  }

  setBotCount(count: number): Promise<SimpleAck> {
    return this.emitWithAck('room:setBots', { count });
  }

  setReady(ready: boolean): Promise<SimpleAck> {
    return this.emitWithAck('player:ready', { ready });
  }

  startMatch(): Promise<SimpleAck> {
    return this.emitWithAck('match:start');
  }

  restartMatch(): Promise<SimpleAck> {
    return this.emitWithAck('match:restart');
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  sendInput(input: PlayerInput): void {
    this.socket?.emit('input:update', input);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private emitWithAck<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected'));
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
