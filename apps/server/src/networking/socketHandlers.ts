import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ControllerJoinAck,
  HostAck,
  PlayerInput,
  RoomErrorCode,
  ServerToClientEvents,
  SimpleAck,
} from '@lss/shared';
import {
  MAX_BOTS_PER_ROOM,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '@lss/shared';
import type { GameRoom } from '../rooms/GameRoom.js';
import type { RoomManager } from '../rooms/RoomManager.js';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  { role?: 'host' | 'controller'; playerId?: string; roomCode?: string }
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

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function isToken(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length >= 16 && raw.length <= 64;
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
    ...(isFiniteNumber(input.moveX) && isFiniteNumber(input.moveY)
      ? { moveX: clampUnit(input.moveX), moveY: clampUnit(input.moveY) }
      : {}),
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
const newToken = (): string => randomUUID().replaceAll('-', '');

export function registerSocketHandlers(
  socket: TypedSocket,
  roomManager: RoomManager,
): void {
  const limiter = new RateLimiter();
  const sid = socket.id;

  const fail = <T extends HostAck | ControllerJoinAck | SimpleAck>(
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

  /** Host-screen commands must come from the socket currently attached as host. */
  const hostRoom = (): GameRoom | undefined => {
    const room = currentRoom();
    return socket.data.role === 'host' && room?.hostSocketId === sid ? room : undefined;
  };

  const leaveCurrentRoom = (explicit: boolean): void => {
    const room = currentRoom();
    const { role, playerId } = socket.data;
    socket.data.roomCode = undefined;
    socket.data.role = undefined;
    socket.data.playerId = undefined;
    if (!room) return;
    void socket.leave(room.code);
    if (role === 'host') {
      void socket.leave(room.hostChannel);
      if (room.hostSocketId !== sid) return;
      if (explicit) room.close('The host closed the room.');
      else room.detachHost();
    } else if (role === 'controller' && playerId) {
      if (explicit) room.removePlayer(playerId);
      else room.disconnectPlayer(playerId);
    }
  };

  const bindHost = (room: GameRoom, token: string): void => {
    socket.data.role = 'host';
    socket.data.roomCode = room.code;
    void socket.join([room.code, room.hostChannel]);
    room.attachHost(sid, token);
  };

  const rateLimited = (key: string, limit: number): boolean =>
    !limiter.allow(`${sid}:${key}`, limit, 10_000);

  // ── host:create ──────────────────────────────────────────────────────────
  socket.on('host:create', (ack) => {
    if (rateLimited('host', 8)) return fail(ack, 'RATE_LIMITED', 'Too many requests. Slow down.');
    leaveCurrentRoom(true);
    const room = roomManager.createRoom();
    const hostToken = newToken();
    bindHost(room, hostToken);
    ack?.({ ok: true, room: room.toRoomInfo(), hostToken });
  });

  // ── host:resume ──────────────────────────────────────────────────────────
  socket.on('host:resume', (payload, ack) => {
    if (rateLimited('host', 8)) return fail(ack, 'RATE_LIMITED', 'Too many requests. Slow down.');
    const code = normalizeRoomCode(payload?.code);
    if (!code) return fail(ack, 'INVALID_CODE', 'Room code must be 4 characters.');
    const room = roomManager.getRoom(code);
    if (!room) return fail(ack, 'ROOM_NOT_FOUND', `No room found with code ${code}.`);
    if (!isToken(payload?.hostToken) || payload.hostToken !== room.hostToken) {
      return fail(ack, 'NOT_HOST', 'This screen is not the host of that room.');
    }
    if (socket.data.roomCode !== room.code) leaveCurrentRoom(true);
    bindHost(room, room.hostToken);
    ack?.({ ok: true, room: room.toRoomInfo(), hostToken: room.hostToken });
  });

  // ── controller:join ──────────────────────────────────────────────────────
  socket.on('controller:join', (payload, ack) => {
    if (rateLimited('join', 12)) return fail(ack, 'RATE_LIMITED', 'Too many requests. Slow down.');
    const name = sanitizeDisplayName(payload?.displayName);
    if (!name) {
      return fail(ack, 'INVALID_NAME', `Display name must be ${MIN_DISPLAY_NAME_LENGTH}-${MAX_DISPLAY_NAME_LENGTH} characters.`);
    }
    const code = normalizeRoomCode(payload?.code);
    if (!code) return fail(ack, 'INVALID_CODE', 'Room code must be 4 characters.');
    const room = roomManager.getRoom(code);
    if (!room) return fail(ack, 'ROOM_NOT_FOUND', `No room found with code ${code}.`);

    const returning = isToken(payload?.playerToken)
      ? room.findPlayerByToken(payload.playerToken)
      : undefined;
    if (returning && returning.socketId === sid) {
      return ack?.({
        ok: true,
        room: room.toRoomInfo(),
        playerId: returning.id,
        playerToken: returning.token ?? '',
      });
    }

    leaveCurrentRoom(true);
    let playerId: string;
    let playerToken: string;
    if (returning?.token) {
      room.reconnectPlayer(returning, sid, name);
      playerId = returning.id;
      playerToken = returning.token;
    } else {
      playerId = newPlayerId();
      playerToken = newToken();
      const added = room.addPlayer({ id: playerId, token: playerToken, socketId: sid, displayName: name });
      if (!added.ok) return fail(ack, added.code, added.error);
    }
    socket.data.role = 'controller';
    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    void socket.join(room.code);
    room.broadcast();
    ack?.({ ok: true, room: room.toRoomInfo(), playerId, playerToken });
  });

  // ── room:leave ───────────────────────────────────────────────────────────
  socket.on('room:leave', (ack) => {
    leaveCurrentRoom(true);
    ack?.({ ok: true });
  });

  // ── room:setBots ─────────────────────────────────────────────────────────
  socket.on('room:setBots', (payload, ack) => {
    const room = hostRoom();
    if (!room) return fail(ack, 'NOT_HOST', 'Only the host screen can configure AI pilots.');
    if (room.status !== 'LOBBY' && room.status !== 'FINISHED') {
      return fail(ack, 'INVALID_STATE', 'Bots can only be changed between rounds.');
    }
    const count = payload?.count;
    if (!isFiniteNumber(count) || count < 0 || count > MAX_BOTS_PER_ROOM) {
      return fail(ack, 'INVALID_BOTS', `Bot count must be 0-${MAX_BOTS_PER_ROOM}.`);
    }
    room.applyBotCount(count);
    room.broadcast();
    ack?.({ ok: true });
  });

  // ── match:start ──────────────────────────────────────────────────────────
  socket.on('match:start', (ack) => {
    if (rateLimited('start', 5)) return fail(ack, 'RATE_LIMITED', 'Too many requests. Slow down.');
    const room = hostRoom();
    if (!room) return fail(ack, 'NOT_HOST', 'Only the host screen can start the match.');
    const result = room.startCountdown();
    if (!result.ok) return fail(ack, result.code, result.error);
    ack?.({ ok: true });
  });

  // ── match:restart ────────────────────────────────────────────────────────
  socket.on('match:restart', (ack) => {
    const room = hostRoom();
    if (!room) return fail(ack, 'NOT_HOST', 'Only the host screen can restart the match.');
    const result = room.restartToLobby();
    if (!result.ok) return fail(ack, result.code, result.error);
    ack?.({ ok: true });
  });

  // ── input:update ─────────────────────────────────────────────────────────
  socket.on('input:update', (raw) => {
    // Cheap per-socket cap against impossible action rates.
    if (!limiter.allow(`${sid}:input`, 150, 1_000)) return;
    if (socket.data.role !== 'controller') return;
    const input = validateInput(raw);
    if (!input) return;
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (room && playerId) room.setInput(playerId, input);
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    leaveCurrentRoom(false);
    limiter.clear(sid);
  });
}
