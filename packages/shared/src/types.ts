// ── Enums ────────────────────────────────────────────────────────────────────
export type MatchStatus = 'LOBBY' | 'COUNTDOWN' | 'ACTIVE' | 'FINISHED';

export type UpgradeType = 'SHIELD' | 'RAPID_FIRE' | 'REPAIR' | 'ENERGY';

export type CosmicEventType = 'METEOR_SHOWER' | 'SOLAR_SURGE' | 'SUPPLY_DROP';

export type EliminationCause =
  | 'PROJECTILE'
  | 'STORM'
  | 'ASTEROID'
  | 'METEOR'
  | 'DISCONNECT';

export type MatchEndReason = 'LAST_SHIP_STANDING' | 'TIMEOUT' | 'ROOM_CLOSED';

// ── Input ────────────────────────────────────────────────────────────────────
/** The only per-frame payload a client may send. Server-authoritative intents only. */
export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Radians, world-space aim direction of the ship's nose. */
  aimAngle: number;
  shooting: boolean;
  /** Monotonically increasing client sequence number for de-duplication. */
  sequence: number;
  /** Space drift / Flight assist disengaged (Inertial Dampeners off). */
  drift?: boolean;
  /** Afterburner thruster boost active (Shift key held). */
  boost?: boolean;
}

// ── Live entity state (inside GameSnapshot) ──────────────────────────────────
export interface PlayerState {
  id: string;
  displayName: string;
  isBot: boolean;
  /** Index into SHIP_COLORS for deterministic client rendering. */
  colorIndex: number;
  x: number;
  y: number;
  /** Facing angle in radians. */
  rotation: number;
  velocityX: number;
  velocityY: number;
  health: number;
  maxHealth: number;
  /** Remaining shield absorb points granted by the SHIELD pickup. */
  shield: number;
  alive: boolean;
  kills: number;
  /** Active upgrade type → server timestamp (ms) when it expires. */
  upgrades: Partial<Record<UpgradeType, number>>;
  /** Server timestamp (ms) until which this ship is spawn-invulnerable. */
  spawnProtectedUntil: number;
  lastInputSequence: number;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  /** Server timestamp (ms) at which the projectile despawns. */
  expiresAt: number;
}

export interface AsteroidState {
  id: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  velocityX: number;
  velocityY: number;
  /** Deterministic seed so clients can procedurally render identical shapes. */
  seed: number;
}

export interface PickupState {
  id: string;
  type: UpgradeType;
  x: number;
  y: number;
  /** Server timestamp (ms) at which the pickup despawns. */
  expiresAt: number;
}

export interface SafeZoneState {
  centerX: number;
  centerY: number;
  /** Current radius in world units. */
  radius: number;
  /** Radius this stage is shrinking toward. */
  targetRadius: number;
  /** Index into SAFE_ZONE_STAGES; -1 before the first stage. */
  stage: number;
  isShrinking: boolean;
  /** Server timestamp (ms) when the next shrink stage begins; null when finished. */
  nextShrinkAt: number | null;
}

export interface CosmicEventState {
  id: string;
  type: CosmicEventType;
  startedAt: number;
  endsAt: number;
  /** Optional epicenter for localized events. */
  x?: number;
  y?: number;
  radius?: number;
}

export interface KillFeedEntry {
  id: string;
  killerId: string | null;
  killerName: string | null;
  victimId: string;
  victimName: string;
  cause: EliminationCause;
  /** Server timestamp (ms). */
  timestamp: number;
}

// ── Snapshot ─────────────────────────────────────────────────────────────────
export interface GameSnapshot {
  tick: number;
  /** Server clock in ms, used for interpolating expiries client-side. */
  serverTime: number;
  status: MatchStatus;
  matchElapsedMs: number;
  timeRemainingMs: number;
  aliveCount: number;
  players: PlayerState[];
  projectiles: ProjectileState[];
  asteroids: AsteroidState[];
  pickups: PickupState[];
  safeZone: SafeZoneState;
  /** Currently active cosmic event, or null. */
  cosmicEvent: CosmicEventState | null;
  /** Rolling window of recent eliminations for the HUD kill feed. */
  killFeed: KillFeedEntry[];
}

// ── Match results ────────────────────────────────────────────────────────────
export interface PlayerMatchStats {
  playerId: string;
  displayName: string;
  isBot: boolean;
  colorIndex: number;
  /** 1 = winner. */
  placement: number;
  kills: number;
  damageDealt: number;
  survivalTimeMs: number;
}

export interface MatchResult {
  roomCode: string;
  winnerPlayerId: string | null;
  winnerName: string | null;
  endReason: MatchEndReason;
  durationMs: number;
  stats: PlayerMatchStats[];
}

// ── Room / lobby ─────────────────────────────────────────────────────────────
export interface RoomPlayerInfo {
  id: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  isConnected: boolean;
  colorIndex: number;
}

export interface RoomInfo {
  code: string;
  status: MatchStatus;
  hostPlayerId: string;
  players: RoomPlayerInfo[];
  botCount: number;
  maxPlayers: number;
  createdAt: number;
}
