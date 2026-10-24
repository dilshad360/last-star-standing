import type {
  ControllerState,
  CosmicEventState,
  GameSnapshot,
  HapticKind,
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
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'INVALID_BOTS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_STATE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type AckSuccess<T extends object = object> = { ok: true } & T;
export type AckFailure = { ok: false; code: RoomErrorCode; error: string };
export type AckResult<T extends object = object> = AckSuccess<T> | AckFailure;

/** Ack returned to the big screen by host:create / host:resume. */
export type HostAck = AckResult<{ room: RoomInfo; hostToken: string }>;
/** Ack returned to a phone by controller:join. */
export type ControllerJoinAck = AckResult<{
  room: RoomInfo;
  playerId: string;
  playerToken: string;
}>;
export type SimpleAck = AckResult;

// ── Client → server payloads ─────────────────────────────────────────────────
export interface HostResumePayload {
  code: string;
  hostToken: string;
}

export interface ControllerJoinPayload {
  code: string;
  displayName: string;
  /** Token from a previous join; reclaims the same ship after a disconnect. */
  playerToken?: string;
}

export interface SetBotsPayload {
  count: number;
}

// ── Client → server events ───────────────────────────────────────────────────
export interface ClientToServerEvents {
  /** Big screen creates a room it owns (the host is not a ship). */
  'host:create': (ack: (res: HostAck) => void) => void;
  'host:resume': (payload: HostResumePayload, ack: (res: HostAck) => void) => void;
  /** Phone joins (or rejoins) a room as a controller. */
  'controller:join': (
    payload: ControllerJoinPayload,
    ack: (res: ControllerJoinAck) => void,
  ) => void;
  'room:leave': (ack?: (res: SimpleAck) => void) => void;
  'room:setBots': (payload: SetBotsPayload, ack: (res: SimpleAck) => void) => void;
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

export interface HapticPayload {
  kind: HapticKind;
}

// ── Server → client events ───────────────────────────────────────────────────
export interface ServerToClientEvents {
  /** Full lobby state; sent to the host and every controller on membership changes. */
  'room:updated': (room: RoomInfo) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
  'match:countdown': (payload: CountdownPayload) => void;
  /** Host screen only. */
  'match:started': (payload: MatchStartedPayload) => void;
  /** Host screen only: full world state at 25 Hz. */
  'game:snapshot': (snapshot: GameSnapshot) => void;
  /** Host screen only. */
  'player:eliminated': (entry: KillFeedEntry) => void;
  /** Host screen only. */
  'cosmic:event': (event: CosmicEventState) => void;
  'match:finished': (result: MatchResult) => void;
  'room:error': (payload: RoomErrorPayload) => void;
  /** Controller only: compact status for this phone's ship. */
  'controller:state': (state: ControllerState) => void;
  /** Controller only: vibration cue. */
  'controller:haptic': (payload: HapticPayload) => void;
}
