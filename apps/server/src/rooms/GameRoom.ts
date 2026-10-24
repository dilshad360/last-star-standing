import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  GameSnapshot,
  MatchResult,
  MatchStatus,
  PlayerInput,
  RoomErrorCode,
  RoomInfo,
  RoomPlayerInfo,
  ServerToClientEvents,
} from '@lss/shared';
import {
  ARENA_CENTER_X,
  ARENA_CENTER_Y,
  COUNTDOWN_DURATION_MS,
  HOST_RECONNECT_GRACE_MS,
  INPUT_STALE_MS,
  MATCH_TIMEOUT_MS,
  MAX_BOTS_PER_ROOM,
  MAX_PLAYERS_PER_ROOM,
  PLAYER_RECONNECT_GRACE_MS,
  SAFE_ZONE_INITIAL_RADIUS,
  SHIP_MAX_HEALTH,
  SPAWN_RING_RADIUS,
  SPAWN_SHIELD_MS,
} from '@lss/shared';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface RoomPlayer {
  id: string;
  /** Secret a phone presents to reclaim this ship after a reconnect; null for bots. */
  token: string | null;
  /** Null for bots and for phones whose socket has disconnected. */
  socketId: string | null;
  displayName: string;
  isBot: boolean;
  isConnected: boolean;
  colorIndex: number;
  latestInput: PlayerInput | null;
  latestInputAt: number;
}

/**
 * Attached to a room when it enters ACTIVE. The factory pattern keeps
 * GameRoom independent of WorldSimulation.
 */
export interface MatchSimulation {
  /** Called once when the room goes ACTIVE; returns the initial snapshot. */
  start(): GameSnapshot;
  stop(): void;
}

export type SimulationFactory = (room: GameRoom) => MatchSimulation;

export type RoomResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; code: RoomErrorCode; error: string };

const BOT_NAMES = [
  'Vega',
  'Orion',
  'Lyra',
  'Rigel',
  'Altair',
  'Sirius',
  'Castor',
  'Mira',
] as const;

const MIN_SHIPS_TO_START = 2;

type ServerEvent = keyof ServerToClientEvents;

/**
 * A party room owned by one big screen (the host). The host renders the
 * arena but is not a ship; every phone that joins controls one ship.
 */
export class GameRoom {
  readonly code: string;
  readonly createdAt = Date.now();
  readonly hostChannel: string;
  status: MatchStatus = 'LOBBY';
  matchStartedAt: number | null = null;
  hostSocketId: string | null = null;
  hostToken = '';

  private readonly players = new Map<string, RoomPlayer>();
  private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private hostGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private botSeq = 0;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private simulation: MatchSimulation | null = null;
  private destroyed = false;

  constructor(
    code: string,
    private readonly io: TypedServer,
    private readonly onEmpty: (room: GameRoom) => void,
    private readonly simulationFactory?: SimulationFactory,
  ) {
    this.code = code;
    this.hostChannel = `host:${code}`;
  }

  // ── Queries ──────────────────────────────────────────────────────────────
  get playerList(): RoomPlayer[] {
    return [...this.players.values()];
  }

  get humans(): RoomPlayer[] {
    return this.playerList.filter((p) => !p.isBot);
  }

  get bots(): RoomPlayer[] {
    return this.playerList.filter((p) => p.isBot);
  }

  get connectedHumans(): RoomPlayer[] {
    return this.humans.filter((p) => p.isConnected);
  }

  get shipCount(): number {
    return this.players.size;
  }

  get isClosed(): boolean {
    return this.destroyed;
  }

  getPlayer(playerId: string): RoomPlayer | undefined {
    return this.players.get(playerId);
  }

  findPlayerByToken(token: string): RoomPlayer | undefined {
    return this.humans.find((p) => p.token === token);
  }

  /** Latest input, or null once it is older than INPUT_STALE_MS. */
  getFreshInput(playerId: string, now = Date.now()): PlayerInput | null {
    const player = this.players.get(playerId);
    if (!player?.latestInput || !player.isConnected) return null;
    return now - player.latestInputAt <= INPUT_STALE_MS ? player.latestInput : null;
  }

  toRoomInfo(): RoomInfo {
    const players: RoomPlayerInfo[] = this.playerList.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isBot: p.isBot,
      isConnected: p.isConnected,
      colorIndex: p.colorIndex,
    }));
    return {
      code: this.code,
      status: this.status,
      hostConnected: this.hostSocketId !== null,
      players,
      botCount: this.bots.length,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      createdAt: this.createdAt,
    };
  }

  broadcast(): void {
    if (this.destroyed) return;
    this.io.to(this.code).emit('room:updated', this.toRoomInfo());
  }

  emitToHost<E extends ServerEvent>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    (this.io.to(this.hostChannel).emit as (e: string, ...a: unknown[]) => boolean)(
      event,
      ...args,
    );
  }

  emitToPlayer<E extends ServerEvent>(
    playerId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    const socketId = this.players.get(playerId)?.socketId;
    if (!socketId) return;
    (this.io.to(socketId).emit as (e: string, ...a: unknown[]) => boolean)(event, ...args);
  }

  // ── Host screen ──────────────────────────────────────────────────────────
  attachHost(socketId: string, token: string): void {
    this.hostSocketId = socketId;
    this.hostToken = token;
    if (this.hostGraceTimer) {
      clearTimeout(this.hostGraceTimer);
      this.hostGraceTimer = null;
    }
    this.broadcast();
  }

  /** Host socket dropped: keep the room alive briefly so the screen can resume. */
  detachHost(): void {
    if (this.destroyed) return;
    this.hostSocketId = null;
    if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer);
    this.hostGraceTimer = setTimeout(
      () => this.close('The host screen left the game.'),
      HOST_RECONNECT_GRACE_MS,
    );
    this.hostGraceTimer.unref?.();
    this.broadcast();
  }

  close(reason: string): void {
    if (this.destroyed) return;
    this.io.to(this.code).emit('room:closed', { reason });
    this.destroy();
  }

  // ── Controllers ──────────────────────────────────────────────────────────
  addPlayer(player: {
    id: string;
    token: string;
    socketId: string;
    displayName: string;
  }): RoomResult<{ player: RoomPlayer }> {
    if (this.destroyed) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Room is closed.' };
    }
    if (this.shipCount >= MAX_PLAYERS_PER_ROOM && !this.removeOneBot()) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        error: `Room is full (${MAX_PLAYERS_PER_ROOM} ships).`,
      };
    }

    const roomPlayer: RoomPlayer = {
      id: player.id,
      token: player.token,
      socketId: player.socketId,
      displayName: player.displayName,
      isBot: false,
      isConnected: true,
      colorIndex: this.nextFreeColorIndex(),
      latestInput: null,
      latestInputAt: 0,
    };
    this.players.set(player.id, roomPlayer);
    return { ok: true, player: roomPlayer };
  }

  /** Re-binds a returning phone to its existing ship. */
  reconnectPlayer(player: RoomPlayer, socketId: string, displayName?: string): void {
    this.clearGraceTimer(player.id);
    player.socketId = socketId;
    player.isConnected = true;
    player.latestInput = null;
    if (displayName) player.displayName = displayName;
  }

  /** Phone socket dropped: hold its slot for PLAYER_RECONNECT_GRACE_MS. */
  disconnectPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;
    player.isConnected = false;
    player.socketId = null;
    player.latestInput = null;
    this.clearGraceTimer(playerId);
    const timer = setTimeout(() => this.removePlayer(playerId), PLAYER_RECONNECT_GRACE_MS);
    timer.unref?.();
    this.graceTimers.set(playerId, timer);
    this.broadcast();
  }

  /** Explicit leave or expired reconnect grace. */
  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;
    this.clearGraceTimer(playerId);
    this.players.delete(playerId);
    this.broadcast();
  }

  setInput(playerId: string, input: PlayerInput, now = Date.now()): void {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;
    player.latestInput = input;
    player.latestInputAt = now;
  }

  // ── AI Bot Pilots ────────────────────────────────────────────────────────
  /** Adjusts the bot roster toward `count`, clamped to fit the ship cap. */
  applyBotCount(count: number): number {
    const clamped = Math.max(
      0,
      Math.min(Math.trunc(count), MAX_BOTS_PER_ROOM, MAX_PLAYERS_PER_ROOM - this.humans.length),
    );
    while (this.bots.length < clamped) this.addBot();
    while (this.bots.length > clamped) this.removeOneBot();
    return this.bots.length;
  }

  private addBot(): void {
    const index = this.botSeq++;
    const bot: RoomPlayer = {
      id: `bot-${this.code}-${index}`,
      token: null,
      socketId: null,
      displayName: `${BOT_NAMES[index % BOT_NAMES.length]} [AI]`,
      isBot: true,
      isConnected: true,
      colorIndex: this.nextFreeColorIndex(),
      latestInput: null,
      latestInputAt: 0,
    };
    this.players.set(bot.id, bot);
  }

  private removeOneBot(): boolean {
    const bot = this.bots.at(-1);
    if (!bot) return false;
    this.players.delete(bot.id);
    return true;
  }

  // ── State machine: LOBBY → COUNTDOWN → ACTIVE → FINISHED → LOBBY ──────────
  startCountdown(): RoomResult {
    if (this.status !== 'LOBBY' && this.status !== 'FINISHED') {
      return {
        ok: false,
        code: 'INVALID_STATE',
        error: `Cannot start a match while the room is ${this.status}.`,
      };
    }
    if (this.shipCount < MIN_SHIPS_TO_START) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        error: 'Need at least 2 ships: scan the QR code with another phone or add AI pilots.',
      };
    }
    this.status = 'COUNTDOWN';
    const startsAt = Date.now() + COUNTDOWN_DURATION_MS;
    this.io
      .to(this.code)
      .emit('match:countdown', { startsAt, durationMs: COUNTDOWN_DURATION_MS });
    this.broadcast();
    this.countdownTimer = setTimeout(() => this.enterActive(), COUNTDOWN_DURATION_MS);
    return { ok: true };
  }

  private enterActive(): void {
    if (this.destroyed) return;
    this.countdownTimer = null;
    this.status = 'ACTIVE';
    this.matchStartedAt = Date.now();
    this.simulation = this.simulationFactory?.(this) ?? null;
    const snapshot = this.simulation?.start() ?? this.buildBootstrapSnapshot();
    this.emitToHost('match:started', { snapshot });
    this.broadcast();
  }

  /** Called by the simulation when the round timer expires. */
  finishMatch(result: MatchResult): void {
    if (this.status !== 'ACTIVE') return;
    this.simulation?.stop();
    this.simulation = null;
    this.status = 'FINISHED';
    this.io.to(this.code).emit('match:finished', result);
    this.broadcast();
  }

  /** Host aborts a running match or returns a finished room to LOBBY. */
  restartToLobby(): RoomResult {
    if (this.status === 'LOBBY') return { ok: true };
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.simulation?.stop();
    this.simulation = null;
    this.status = 'LOBBY';
    this.matchStartedAt = null;
    this.broadcast();
    return { ok: true };
  }

  // ── Internals ────────────────────────────────────────────────────────────
  private nextFreeColorIndex(): number {
    const used = new Set(this.playerList.map((p) => p.colorIndex));
    for (let i = 0; i < MAX_PLAYERS_PER_ROOM; i++) {
      if (!used.has(i)) return i;
    }
    return 0;
  }

  private clearGraceTimer(playerId: string): void {
    const timer = this.graceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(playerId);
  }

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer);
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.countdownTimer = null;
    this.hostGraceTimer = null;
    this.graceTimers.clear();
    this.simulation?.stop();
    this.simulation = null;
    this.onEmpty(this);
  }

  /**
   * ACTIVE-state snapshot used when no simulation factory is attached
   * (room-only tests). Ships spawn on the radial ring with a spawn shield.
   */
  private buildBootstrapSnapshot(): GameSnapshot {
    const now = Date.now();
    const ships = this.playerList;
    const angularOffset = Math.random() * Math.PI * 2;
    return {
      tick: 0,
      serverTime: now,
      status: 'ACTIVE',
      matchElapsedMs: 0,
      timeRemainingMs: MATCH_TIMEOUT_MS,
      aliveCount: ships.length,
      players: ships.map((p, i) => {
        const angle = angularOffset + (i * Math.PI * 2) / ships.length;
        return {
          id: p.id,
          displayName: p.displayName,
          isBot: p.isBot,
          colorIndex: p.colorIndex,
          x: ARENA_CENTER_X + Math.cos(angle) * SPAWN_RING_RADIUS,
          y: ARENA_CENTER_Y + Math.sin(angle) * SPAWN_RING_RADIUS,
          rotation: angle + Math.PI,
          velocityX: 0,
          velocityY: 0,
          health: SHIP_MAX_HEALTH,
          maxHealth: SHIP_MAX_HEALTH,
          shield: 0,
          alive: true,
          kills: 0,
          deaths: 0,
          respawnAt: null,
          connected: p.isConnected,
          upgrades: {},
          spawnProtectedUntil: now + SPAWN_SHIELD_MS,
          lastInputSequence: 0,
        };
      }),
      projectiles: [],
      asteroids: [],
      pickups: [],
      safeZone: {
        centerX: ARENA_CENTER_X,
        centerY: ARENA_CENTER_Y,
        radius: SAFE_ZONE_INITIAL_RADIUS,
        targetRadius: SAFE_ZONE_INITIAL_RADIUS,
        stage: -1,
        isShrinking: false,
        nextShrinkAt: null,
      },
      cosmicEvent: null,
      killFeed: [],
    };
  }
}
