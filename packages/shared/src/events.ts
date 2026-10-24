import type {
  CosmicEventState,
  GameSnapshot,
  KillFeedEntry,
  MatchResult,
  PlayerInput,
  RoomInfo,
} from './types.js';

// ── Acknowledgements ─────────────────────────────────────────────────────────
export type RoomErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'MATCH_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'INVALID_BOTS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_STATE'
  | 'INTERNAL';

export type AckSuccess<T extends object = object> = { ok: true } & T;
export type AckFailure = { ok: false; code: RoomErrorCode; error: string };
export type AckResult<T extends object = object> = AckSuccess<T> | AckFailure;

/** Ack returned by room:create / room:join / room:quickPlay. */
export type JoinAck = AckResult<{ room: RoomInfo; playerId: string }>;
export type SimpleAck = AckResult;

// ── Client → server payloads ─────────────────────────────────────────────────
export interface CreateRoomPayload {
  displayName: string;
}

export interface JoinRoomPayload {
  code: string;
  displayName: string;
}

export interface QuickPlayPayload {
  displayName: string;
  /** Desired AI Bot Pilot count; clamped server-side to MAX_BOTS_PER_ROOM. */
  botCount?: number;
}

export interface SetBotsPayload {
  count: number;
}

export interface PlayerReadyPayload {
  ready: boolean;
}

// ── Client → server events ───────────────────────────────────────────────────
export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: (res: JoinAck) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (res: JoinAck) => void) => void;
  'room:quickPlay': (payload: QuickPlayPayload, ack: (res: JoinAck) => void) => void;
  'room:leave': (ack?: (res: SimpleAck) => void) => void;
  'room:setBots': (payload: SetBotsPayload, ack: (res: SimpleAck) => void) => void;
  'player:ready': (payload: PlayerReadyPayload, ack?: (res: SimpleAck) => void) => void;
  'match:start': (ack: (res: SimpleAck) => void) => void;
  'match:restart': (ack: (res: SimpleAck) => void) => void;
  'input:update': (input: PlayerInput) => void;
}

// ── Server → client payloads ─────────────────────────────────────────────────
export interface CountdownPayload {
  /** Server timestamp (ms) when the match goes ACTIVE. */
  startsAt: number;
  durationMs: number;
}

export interface MatchStartedPayload {
  snapshot: GameSnapshot;
}

export interface RoomErrorPayload {
  code: RoomErrorCode;
  message: string;
}

export interface RoomClosedPayload {
  reason: string;
}

// ── Server → client events ───────────────────────────────────────────────────
export interface ServerToClientEvents {
  /** Full lobby state; sent on every room membership/ready/bot change. */
  'room:updated': (room: RoomInfo) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
  'match:countdown': (payload: CountdownPayload) => void;
  'match:started': (payload: MatchStartedPayload) => void;
  'game:snapshot': (snapshot: GameSnapshot) => void;
  'player:eliminated': (entry: KillFeedEntry) => void;
  /** Fired when the CosmicDirector triggers an anomaly; also in snapshots. */
  'cosmic:event': (event: CosmicEventState) => void;
  'match:finished': (result: MatchResult) => void;
  'room:error': (payload: RoomErrorPayload) => void;
}
