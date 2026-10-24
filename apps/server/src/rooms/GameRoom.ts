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
  MATCH_TIMEOUT_MS,
  MAX_BOTS_PER_ROOM,
  MAX_PLAYERS_PER_ROOM,
  SAFE_ZONE_INITIAL_RADIUS,
  SAFE_ZONE_STAGES,
  SHIP_MAX_HEALTH,
  SPAWN_RING_RADIUS,
  SPAWN_SHIELD_MS,
} from '@lss/shared';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface RoomPlayer {
  id: string;
  /** Null for bots and for humans whose socket has disconnected. */
  socketId: string | null;
  displayName: string;
  isBot: boolean;
  isReady: boolean;
  isConnected: boolean;
  colorIndex: number;
  latestInput: PlayerInput | null;
}

/**
 * Attached to a room when it enters ACTIVE. Phase 3 supplies the real
 * WorldSimulation; the factory pattern keeps GameRoom dependency-free.
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

export class GameRoom {
  readonly code: string;
  readonly createdAt = Date.now();
  status: MatchStatus = 'LOBBY';
  hostPlayerId = '';
  matchStartedAt: number | null = null;
  isCustom = false;

  private readonly players = new Map<string, RoomPlayer>();
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

  getPlayer(playerId: string): RoomPlayer | undefined {
    return this.players.get(playerId);
  }

  toRoomInfo(): RoomInfo {
    const players: RoomPlayerInfo[] = this.playerList.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isHost: p.id === this.hostPlayerId,
      isReady: p.isReady,
      isBot: p.isBot,
      isConnected: p.isConnected,
      colorIndex: p.colorIndex,
    }));
    return {
      code: this.code,
      status: this.status,
      hostPlayerId: this.hostPlayerId,
      players,
      botCount: this.bots.length,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      createdAt: this.createdAt,
      isCustom: this.isCustom,
    };
  }

  broadcast(): void {
    this.io.to(this.code).emit('room:updated', this.toRoomInfo());
  }

  // ── Membership ───────────────────────────────────────────────────────────
  addPlayer(player: {
    id: string;
    socketId: string;
    displayName: string;
  }): RoomResult<{ player: RoomPlayer }> {
    if (this.destroyed) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: 'Room is closed.' };
    }
    if (this.status !== 'LOBBY') {
      return {
        ok: false,
        code: 'MATCH_IN_PROGRESS',
        error: 'A match is already in progress in this room.',
      };
    }
    if (this.shipCount >= MAX_PLAYERS_PER_ROOM && !this.removeOneBot()) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        error: 'Room is full (8 ships).',
      };
    }

    const roomPlayer: RoomPlayer = {
      id: player.id,
      socketId: player.socketId,
      displayName: player.displayName,
      isBot: false,
      isReady: false,
      isConnected: true,
      colorIndex: this.nextFreeColorIndex(),
      latestInput: null,
    };
    this.players.set(player.id, roomPlayer);
    if (!this.hostPlayerId) this.hostPlayerId = player.id;
    return { ok: true, player: roomPlayer };
  }

  /** Explicit leave or socket disconnect — identical server-side handling. */
  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;

    if (this.status === 'LOBBY' || this.status === 'COUNTDOWN') {
      this.players.delete(playerId);
    } else {
      // ACTIVE/FINISHED: keep the ship for the simulation/results, mark gone.
      player.isConnected = false;
      player.socketId = null;
    }

    if (this.hostPlayerId === playerId) {
      this.hostPlayerId = this.connectedHumans[0]?.id ?? '';
    }
    this.checkEmpty();
    this.broadcast();
  }

  setReady(playerId: string, ready: boolean): boolean {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return false;
    player.isReady = ready;
    return true;
  }

  setInput(playerId: string, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (player && !player.isBot) player.latestInput = input;
  }

  // ── AI Bot Pilots ────────────────────────────────────────────────────────
  /** Adjusts the bot roster toward `count`, clamped to fit the 8-ship cap. */
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
      socketId: null,
      displayName: `${BOT_NAMES[index % BOT_NAMES.length]} [AI]`,
      isBot: true,
      isReady: true,
      isConnected: true,
      colorIndex: this.nextFreeColorIndex(),
      latestInput: null,
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
    if (this.status !== 'LOBBY') {
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
        error: 'Need at least 2 ships — add AI Bot Pilots or invite a friend.',
      };
    }
    this.status = 'COUNTDOWN';
    const startsAt = Date.now() + COUNTDOWN_DURATION_MS;
    this.io
      .to(this.code)
      .emit('match:countdown', { startsAt, durationMs: COUNTDOWN_DURATION_MS });
    this.broadcast();
    this.countdownTimer = setTimeout(
      () => this.enterActive(),
      COUNTDOWN_DURATION_MS,
    );
    return { ok: true };
  }

  private enterActive(): void {
    if (this.destroyed) return;
    this.countdownTimer = null;
    this.status = 'ACTIVE';
    this.matchStartedAt = Date.now();
    this.simulation = this.simulationFactory?.(this) ?? null;
    const snapshot = this.simulation?.start() ?? this.buildBootstrapSnapshot();
    this.io.to(this.code).emit('match:started', { snapshot });
    this.broadcast();
  }

  /** Called by the simulation (Phase 3) when a winner is resolved. */
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
    for (const player of this.humans) player.isReady = false;
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

  private checkEmpty(): void {
    if (this.destroyed || this.connectedHumans.length > 0) return;
    this.destroy();
  }

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.simulation?.stop();
    this.simulation = null;
    this.onEmpty(this);
  }

  /**
   * Placeholder ACTIVE-state snapshot used until Phase 3 attaches the real
   * WorldSimulation via the factory. Ships spawn on the radial ring with the
   * standard 2.5s spawn shield so clients already receive a valid contract.
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
          rotation: angle + Math.PI / 2,
          velocityX: 0,
          velocityY: 0,
          health: SHIP_MAX_HEALTH,
          maxHealth: SHIP_MAX_HEALTH,
          shield: 0,
          alive: true,
          kills: 0,
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
        nextShrinkAt: now + (SAFE_ZONE_STAGES[0]?.delayMs ?? 30_000),
      },
      cosmicEvent: null,
      killFeed: [],
    };
  }
}
