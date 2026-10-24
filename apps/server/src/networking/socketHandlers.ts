import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  JoinAck,
  PlayerInput,
  RoomErrorCode,
  ServerToClientEvents,
  SimpleAck,
} from '@lss/shared';
import {
  MAX_BOTS_PER_ROOM,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  QUICK_PLAY_DEFAULT_BOTS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '@lss/shared';
import type { GameRoom } from '../rooms/GameRoom.js';
import type { RoomManager } from '../rooms/RoomManager.js';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  { playerId?: string; roomCode?: string }
>;

type Ack<T> = ((res: T) => void) | undefined;

// ── Validation helpers ───────────────────────────────────────────────────────
function sanitizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return name.length >= MIN_DISPLAY_NAME_LENGTH ? name : null;
}

function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const char of code) {
    if (!ROOM_CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateInput(raw: unknown): PlayerInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (!isFiniteNumber(input.aimAngle) || !isFiniteNumber(input.sequence)) {
    return null;
  }
  return {
    up: input.up === true,
    down: input.down === true,
    left: input.left === true,
    right: input.right === true,
    aimAngle: input.aimAngle,
    shooting: input.shooting === true,
    sequence: input.sequence,
    drift: input.drift === true,
    boost: input.boost === true,
  };
}

// ── Sliding-window rate limiter (per socket) ─────────────────────────────────
class RateLimiter {
  private readonly windows = new Map<string, number[]>();

  allow(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const hits = (this.windows.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      this.windows.set(key, hits);
      return false;
    }
    hits.push(now);
    this.windows.set(key, hits);
    return true;
  }

  clear(socketId: string): void {
    for (const key of this.windows.keys()) {
      if (key.startsWith(`${socketId}:`)) this.windows.delete(key);
    }
  }
}

const newPlayerId = (): string => `p-${randomUUID().replaceAll('-', '').slice(0, 12)}`;

export function registerSocketHandlers(
  socket: TypedSocket,
  roomManager: RoomManager,
): void {
  const limiter = new RateLimiter();
  const sid = socket.id;

  const fail = <T extends JoinAck | SimpleAck>(
    ack: Ack<T>,
    code: RoomErrorCode,
    error: string,
  ): void => {
    if (typeof ack === 'function') ack({ ok: false, code, error } as T);
  };

  const currentRoom = (): GameRoom | undefined => {
    const code = socket.data.roomCode;
    return code ? roomManager.getRoom(code) : undefined;
  };

  const leaveCurrentRoom = (): void => {
    const room = currentRoom();
    const playerId = socket.data.playerId;
    socket.data.roomCode = undefined;
    if (room && playerId) {
      socket.leave(room.code);
      room.removePlayer(playerId);
    }
  };

  const joinRoom = (
    socket2: TypedSocket,
    room: GameRoom,
    displayName: string,
  ): { ok: true; playerId: string } | { ok: false; code: RoomErrorCode; error: string } => {
    const playerId = newPlayerId();
    const result = room.addPlayer({ id: playerId, socketId: socket2.id, displayName });
    if (!result.ok) return result;
    socket2.data.playerId = playerId;
    socket2.data.roomCode = room.code;
    void socket2.join(room.code);
    return { ok: true, playerId };
  };

  // ── room:create ──────────────────────────────────────────────────────────
  socket.on('room:create', (payload, ack) => {
    if (!limiter.allow(`${sid}:create`, 8, 10_000)) {
      return fail(ack, 'INTERNAL', 'Too many requests. Slow down.');
    }
    const name = sanitizeDisplayName(payload?.displayName);
    if (!name) {
      return fail(ack, 'INVALID_NAME', `Display name must be ${MIN_DISPLAY_NAME_LENGTH}-${MAX_DISPLAY_NAME_LENGTH} characters.`);
    }
    leaveCurrentRoom();
    const room = roomManager.createRoom();
    const joined = joinRoom(socket, room, name);
    if (!joined.ok) {
      roomManager.removeRoom(room.code);
      return fail(ack, joined.code, joined.error);
    }
    room.broadcast();
    ack?.({ ok: true, room: room.toRoomInfo(), playerId: joined.playerId });
  });

  // ── room:join ────────────────────────────────────────────────────────────
  socket.on('room:join', (payload, ack) => {
    if (!limiter.allow(`${sid}:join`, 12, 10_000)) {
      return fail(ack, 'INTERNAL', 'Too many requests. Slow down.');
    }
    const name = sanitizeDisplayName(payload?.displayName);
    if (!name) {
      return fail(ack, 'INVALID_NAME', `Display name must be ${MIN_DISPLAY_NAME_LENGTH}-${MAX_DISPLAY_NAME_LENGTH} characters.`);
    }
    const code = normalizeRoomCode(payload?.code);
    if (!code) {
      return fail(ack, 'INVALID_CODE', 'Room code must be 4 characters.');
    }
    const room = roomManager.getRoom(code);
    if (!room) {
      return fail(ack, 'ROOM_NOT_FOUND', `No room found with code ${code}.`);
    }
    if (socket.data.roomCode === room.code && socket.data.playerId) {
      // Idempotent rejoin from the same socket.
      return ack?.({ ok: true, room: room.toRoomInfo(), playerId: socket.data.playerId });
    }
    leaveCurrentRoom();
    const joined = joinRoom(socket, room, name);
    if (!joined.ok) return fail(ack, joined.code, joined.error);
    room.broadcast();
    ack?.({ ok: true, room: room.toRoomInfo(), playerId: joined.playerId });
  });

  // ── room:quickPlay ───────────────────────────────────────────────────────
  socket.on('room:quickPlay', (payload, ack) => {
    if (!limiter.allow(`${sid}:quick`, 8, 10_000)) {
      return fail(ack, 'INTERNAL', 'Too many requests. Slow down.');
    }
    const name = sanitizeDisplayName(payload?.displayName);
    if (!name) {
      return fail(ack, 'INVALID_NAME', `Display name must be ${MIN_DISPLAY_NAME_LENGTH}-${MAX_DISPLAY_NAME_LENGTH} characters.`);
    }
    leaveCurrentRoom();

    let room = roomManager.findQuickPlayRoom();
    const created = !room;
    room ??= roomManager.createRoom();

    const joined = joinRoom(socket, room, name);
    if (!joined.ok) {
      if (created) roomManager.removeRoom(room.code);
      return fail(ack, joined.code, joined.error);
    }

    if (created) {
      const requested = isFiniteNumber(payload?.botCount)
        ? payload.botCount
        : QUICK_PLAY_DEFAULT_BOTS;
      room.applyBotCount(requested);
    }
    room.setReady(joined.playerId, true);
    room.broadcast();
    ack?.({ ok: true, room: room.toRoomInfo(), playerId: joined.playerId });

    // Instant-match promise: a freshly created quick-play room launches the
    // countdown automatically.
    if (created) room.startCountdown();
  });

  // ── room:leave ───────────────────────────────────────────────────────────
  socket.on('room:leave', (ack) => {
    leaveCurrentRoom();
    ack?.({ ok: true });
  });

  // ── room:setBots ─────────────────────────────────────────────────────────
  socket.on('room:setBots', (payload, ack) => {
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (!room || !playerId) return fail(ack, 'NOT_IN_ROOM', 'You are not in a room.');
    if (room.hostPlayerId !== playerId) {
      return fail(ack, 'NOT_HOST', 'Only the host can configure AI Bot Pilots.');
    }
    if (room.status !== 'LOBBY') {
      return fail(ack, 'INVALID_STATE', 'Bots can only be changed in the lobby.');
    }
    const count = payload?.count;
    if (!isFiniteNumber(count) || count < 0 || count > MAX_BOTS_PER_ROOM) {
      return fail(ack, 'INVALID_BOTS', `Bot count must be 0-${MAX_BOTS_PER_ROOM}.`);
    }
    room.applyBotCount(count);
    room.broadcast();
    ack?.({ ok: true });
  });

  // ── player:ready ─────────────────────────────────────────────────────────
  socket.on('player:ready', (payload, ack) => {
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (!room || !playerId) return fail(ack, 'NOT_IN_ROOM', 'You are not in a room.');
    if (!room.setReady(playerId, payload?.ready === true)) {
      return fail(ack, 'INTERNAL', 'Unable to set ready state.');
    }
    room.broadcast();
    ack?.({ ok: true });
  });

  // ── match:start ──────────────────────────────────────────────────────────
  socket.on('match:start', (ack) => {
    if (!limiter.allow(`${sid}:start`, 5, 10_000)) {
      return fail(ack, 'INTERNAL', 'Too many requests. Slow down.');
    }
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (!room || !playerId) return fail(ack, 'NOT_IN_ROOM', 'You are not in a room.');
    if (room.hostPlayerId !== playerId) {
      return fail(ack, 'NOT_HOST', 'Only the host can start the match.');
    }
    const result = room.startCountdown();
    if (!result.ok) return fail(ack, result.code, result.error);
    ack?.({ ok: true });
  });

  // ── match:restart ────────────────────────────────────────────────────────
  socket.on('match:restart', (ack) => {
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (!room || !playerId) return fail(ack, 'NOT_IN_ROOM', 'You are not in a room.');
    if (room.hostPlayerId !== playerId) {
      return fail(ack, 'NOT_HOST', 'Only the host can restart the match.');
    }
    const result = room.restartToLobby();
    if (!result.ok) return fail(ack, result.code, result.error);
    ack?.({ ok: true });
  });

  // ── input:update ─────────────────────────────────────────────────────────
  socket.on('input:update', (raw) => {
    // Cheap per-socket cap against impossible action rates.
    if (!limiter.allow(`${sid}:input`, 150, 1_000)) return;
    const input = validateInput(raw);
    if (!input) return;
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (room && playerId) room.setInput(playerId, input);
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    leaveCurrentRoom();
    limiter.clear(sid);
  });
}
