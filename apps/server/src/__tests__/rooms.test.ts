import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  CountdownPayload,
  GameSnapshot,
  JoinAck,
  MatchStartedPayload,
  RoomInfo,
  ServerToClientEvents,
  SimpleAck,
} from '@lss/shared';
import {
  COUNTDOWN_DURATION_MS,
  MAX_BOTS_PER_ROOM,
  MAX_PLAYERS_PER_ROOM,
  ROOM_CODE_ALPHABET,
  SPAWN_RING_RADIUS,
} from '@lss/shared';
import { createGameServer, type GameServer } from '../index.js';

type Socket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServer;
let baseUrl: string;

const openSockets = new Set<Socket>();

beforeAll(async () => {
  server = createGameServer();
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  server.io.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

function connect(): Promise<Socket> {
  const socket: Socket = ioc(baseUrl, { transports: ['websocket'] });
  openSockets.add(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emitAck<T>(
  socket: Socket,
  event: keyof ClientToServerEvents,
  payload?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const args: unknown[] = payload === undefined ? [] : [payload];
    const emitter = socket.timeout(5000) as unknown as {
      emit: (event: string, ...emitArgs: unknown[]) => void;
    };
    emitter.emit(event, ...args, (err: Error | null, res: T) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

function waitFor<T>(socket: Socket, event: keyof ServerToClientEvents, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${String(event)}`)),
      ms,
    );
    const listener = socket as unknown as {
      once: (event: string, cb: (payload: T) => void) => void;
    };
    listener.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const createRoom = (socket: Socket, displayName = 'Nova') =>
  emitAck<JoinAck>(socket, 'room:create', { displayName });

const joinRoom = (socket: Socket, code: string, displayName = 'Guest') =>
  emitAck<JoinAck>(socket, 'room:join', { code, displayName });

describe('health endpoint', () => {
  it('returns status ok with room/player metrics', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(typeof body.rooms).toBe('number');
    expect(typeof body.players).toBe('number');
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});

describe('room lifecycle', () => {
  it('creates a room with a 4-char unambiguous code and host player', async () => {
    const socket = await connect();
    const ack = await createRoom(socket);
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.room.code).toHaveLength(4);
    for (const char of ack.room.code) {
      expect(ROOM_CODE_ALPHABET).toContain(char);
    }
    expect(ack.room.status).toBe('LOBBY');
    expect(ack.room.hostPlayerId).toBe(ack.playerId);
    expect(ack.room.players).toHaveLength(1);
    expect(ack.room.players[0]!.isHost).toBe(true);
    socket.disconnect();
  });

  it('broadcasts lobby updates when a second client joins', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');

    const guest = await connect();
    const hostSeesJoin = waitFor<RoomInfo>(host, 'room:updated');
    const guestAck = await joinRoom(guest, hostAck.room.code, 'Vega');
    expect(guestAck.ok).toBe(true);

    const updated = await hostSeesJoin;
    expect(updated.players).toHaveLength(2);
    expect(updated.players.map((p) => p.displayName)).toEqual(
      expect.arrayContaining(['Nova', 'Vega']),
    );
    host.disconnect();
    guest.disconnect();
  });

  it('rejects invalid names, malformed codes, and missing rooms', async () => {
    const socket = await connect();
    const badName = await emitAck<JoinAck>(socket, 'room:create', { displayName: '   ' });
    expect(badName).toMatchObject({ ok: false, code: 'INVALID_NAME' });

    const badCode = await joinRoom(socket, '!!');
    expect(badCode).toMatchObject({ ok: false, code: 'INVALID_CODE' });

    const missing = await joinRoom(socket, 'ZZZZ');
    expect(missing).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
    socket.disconnect();
  });

  it('lets the host configure 0-7 AI bot pilots and rejects non-host calls', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');

    const guest = await connect();
    await joinRoom(guest, hostAck.room.code);

    const denied = await emitAck<SimpleAck>(guest, 'room:setBots', { count: 3 });
    expect(denied).toMatchObject({ ok: false, code: 'NOT_HOST' });

    const tooMany = await emitAck<SimpleAck>(host, 'room:setBots', {
      count: MAX_BOTS_PER_ROOM + 1,
    });
    expect(tooMany).toMatchObject({ ok: false, code: 'INVALID_BOTS' });

    const granted = await emitAck<SimpleAck>(host, 'room:setBots', { count: 3 });
    expect(granted.ok).toBe(true);

    const room = server.roomManager.getRoom(hostAck.room.code)!;
    expect(room.bots).toHaveLength(3);
    expect(room.shipCount).toBe(5); // 2 humans + 3 bots
    host.disconnect();
    guest.disconnect();
  });

  it('displaces a bot when a human joins a bot-filled room', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');
    await emitAck<SimpleAck>(host, 'room:setBots', { count: MAX_BOTS_PER_ROOM });

    const guest = await connect();
    const guestAck = await joinRoom(guest, hostAck.room.code);
    expect(guestAck.ok).toBe(true);
    if (!guestAck.ok) return;
    expect(guestAck.room.players).toHaveLength(MAX_PLAYERS_PER_ROOM);
    expect(guestAck.room.botCount).toBe(MAX_BOTS_PER_ROOM - 1);
    host.disconnect();
    guest.disconnect();
  });

  it('returns ROOM_FULL for a 9th human', async () => {
    const sockets: Socket[] = [];
    const host = await connect();
    sockets.push(host);
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');

    for (let i = 0; i < MAX_PLAYERS_PER_ROOM - 1; i++) {
      const socket = await connect();
      sockets.push(socket);
      const ack = await joinRoom(socket, hostAck.room.code, `P${i}`);
      expect(ack.ok).toBe(true);
    }

    const ninth = await connect();
    sockets.push(ninth);
    const denied = await joinRoom(ninth, hostAck.room.code, 'Late');
    expect(denied).toMatchObject({ ok: false, code: 'ROOM_FULL' });
    for (const socket of sockets) socket.disconnect();
  });

  it('toggles player ready state and broadcasts it', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');

    const updated = waitFor<RoomInfo>(host, 'room:updated');
    const ack = await emitAck<SimpleAck>(host, 'player:ready', { ready: true });
    expect(ack.ok).toBe(true);
    const room = await updated;
    expect(room.players[0]!.isReady).toBe(true);
    host.disconnect();
  });
});

describe('match state machine', () => {
  it('enforces host-only start and minimum ship count', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');

    const lonely = await emitAck<SimpleAck>(host, 'match:start');
    expect(lonely).toMatchObject({ ok: false, code: 'NOT_ENOUGH_PLAYERS' });

    await emitAck<SimpleAck>(host, 'room:setBots', { count: 2 });
    const guest = await connect();
    await joinRoom(guest, hostAck.room.code);
    const denied = await emitAck<SimpleAck>(guest, 'match:start');
    expect(denied).toMatchObject({ ok: false, code: 'NOT_HOST' });
    host.disconnect();
    guest.disconnect();
  });

  it('runs LOBBY → COUNTDOWN → ACTIVE with a spawned snapshot', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');
    await emitAck<SimpleAck>(host, 'room:setBots', { count: 3 });

    const countdownP = waitFor<CountdownPayload>(host, 'match:countdown');
    const startedP = waitFor<MatchStartedPayload>(host, 'match:started');

    const started = await emitAck<SimpleAck>(host, 'match:start');
    expect(started.ok).toBe(true);

    const countdown = await countdownP;
    expect(countdown.durationMs).toBe(COUNTDOWN_DURATION_MS);
    expect(countdown.startsAt).toBeGreaterThan(Date.now());

    const { snapshot } = await startedP;
    expect(snapshot.status).toBe('ACTIVE');
    expect(snapshot.players).toHaveLength(4); // 1 human + 3 bots
    for (const player of snapshot.players) {
      const distance = Math.hypot(player.x - 1200, player.y - 1200);
      expect(distance).toBeCloseTo(SPAWN_RING_RADIUS, 0);
      expect(player.spawnProtectedUntil).toBeGreaterThan(Date.now());
    }
    const room = server.roomManager.getRoom(hostAck.room.code)!;
    expect(room.status).toBe('ACTIVE');
    host.disconnect();
  }, 10_000);

  it('host restart returns an ACTIVE room to LOBBY', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');
    await emitAck<SimpleAck>(host, 'room:setBots', { count: 1 });
    await emitAck<SimpleAck>(host, 'match:start');
    await waitFor<MatchStartedPayload>(host, 'match:started');

    const backToLobby = waitFor<RoomInfo>(host, 'room:updated');
    const ack = await emitAck<SimpleAck>(host, 'match:restart');
    expect(ack.ok).toBe(true);
    const room = await backToLobby;
    expect(room.status).toBe('LOBBY');
    host.disconnect();
  }, 10_000);
});

describe('quick play', () => {
  it('creates a bot-filled room and auto-starts the countdown', async () => {
    const socket = await connect();
    const countdownP = waitFor<CountdownPayload>(socket, 'match:countdown');
    const startedP = waitFor<MatchStartedPayload>(socket, 'match:started');

    const ack = await emitAck<JoinAck>(socket, 'room:quickPlay', {
      displayName: 'Solo',
      botCount: 4,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.room.players).toHaveLength(5); // 1 human + 4 bots
    expect(ack.room.botCount).toBe(4);

    await countdownP;
    const { snapshot } = await startedP;
    expect(snapshot.players).toHaveLength(5);
    socket.disconnect();
  }, 10_000);

  it('does not match quick play into existing custom rooms', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    expect(hostAck.ok).toBe(true);
    if (!hostAck.ok) throw new Error('create failed');
    expect(hostAck.room.isCustom).toBe(true);

    const quickSocket = await connect();
    const quickAck = await emitAck<JoinAck>(quickSocket, 'room:quickPlay', {
      displayName: 'BotPlayer',
      botCount: 3,
    });
    expect(quickAck.ok).toBe(true);
    if (!quickAck.ok) throw new Error('quickPlay failed');

    // Quick play must NOT join the custom room!
    expect(quickAck.room.code).not.toBe(hostAck.room.code);
    expect(quickAck.room.isCustom).toBe(false);

    // Host room must still only contain the host
    const hostRoom = server.roomManager.getRoom(hostAck.room.code);
    expect(hostRoom?.humans).toHaveLength(1);

    host.disconnect();
    quickSocket.disconnect();
  }, 10_000);
});

describe('disconnect handling', () => {
  it('reassigns host to the next human when the host disconnects', async () => {
    const host = await connect();
    const hostAck = await createRoom(host);
    if (!hostAck.ok) throw new Error('create failed');

    const guest = await connect();
    const guestAck = await joinRoom(guest, hostAck.room.code);
    if (!guestAck.ok) throw new Error('join failed');

    const updated = waitFor<RoomInfo>(guest, 'room:updated');
    host.disconnect();
    const room = await updated;
    expect(room.hostPlayerId).toBe(guestAck.playerId);
    expect(room.players.find((p) => p.id === guestAck.playerId)?.isHost).toBe(true);
    guest.disconnect();
  });

  it('cleans up the room when the last human leaves', async () => {
    const socket = await connect();
    const ack = await createRoom(socket);
    if (!ack.ok) throw new Error('create failed');
    await emitAck<SimpleAck>(socket, 'room:setBots', { count: 3 });
    socket.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.roomManager.getRoom(ack.room.code)).toBeUndefined();
  });
});
