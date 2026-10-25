import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  CountdownPayload,
  ControllerJoinAck,
  ControllerState,
  GameSnapshot,
  HostAck,
  MatchStartedPayload,
  RoomClosedPayload,
  RoomInfo,
  ServerToClientEvents,
  SimpleAck,
} from '@lss/shared';
import {
  COUNTDOWN_DURATION_MS,
  MAX_BOTS_PER_ROOM,
  MAX_PLAYERS_PER_ROOM,
  ROOM_CODE_ALPHABET,
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

const hostCreate = (socket: Socket) => emitAck<HostAck>(socket, 'host:create');

const controllerJoin = (
  socket: Socket,
  code: string,
  displayName = 'Guest',
  playerToken?: string,
) => emitAck<ControllerJoinAck>(socket, 'controller:join', { code, displayName, playerToken });

async function hostedRoom(): Promise<{ host: Socket; code: string; hostToken: string }> {
  const host = await connect();
  const ack = await hostCreate(host);
  if (!ack.ok) throw new Error(`host:create failed: ${ack.error}`);
  return { host, code: ack.room.code, hostToken: ack.hostToken };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

describe('host screen rooms', () => {
  it('creates an empty room with a 4-char unambiguous code; the host is not a ship', async () => {
    const socket = await connect();
    const ack = await hostCreate(socket);
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.room.code).toHaveLength(4);
    for (const char of ack.room.code) expect(ROOM_CODE_ALPHABET).toContain(char);
    expect(ack.room.status).toBe('LOBBY');
    expect(ack.room.hostConnected).toBe(true);
    expect(ack.room.players).toHaveLength(0);
    expect(ack.hostToken.length).toBeGreaterThanOrEqual(16);
    socket.disconnect();
  });

  it('broadcasts lobby updates to the host when phones join', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    const hostSeesJoin = waitFor<RoomInfo>(host, 'room:updated');
    const joinAck = await controllerJoin(phone, code, 'Vega');
    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) return;
    expect(joinAck.playerToken.length).toBeGreaterThanOrEqual(16);
    const updated = await hostSeesJoin;
    expect(updated.players.map((p) => p.displayName)).toEqual(['Vega']);
    host.disconnect();
    phone.disconnect();
  });

  it('rejects invalid names, malformed codes, and missing rooms', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    const badName = await controllerJoin(phone, code, '   ');
    expect(badName).toMatchObject({ ok: false, code: 'INVALID_NAME' });
    const badCode = await controllerJoin(phone, 'O0I1', 'Nova');
    expect(badCode).toMatchObject({ ok: false, code: 'INVALID_CODE' });
    const missing = await controllerJoin(phone, 'ZZZZ', 'Nova');
    expect(missing).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
    host.disconnect();
    phone.disconnect();
  });

  it('lets only the host screen configure AI pilots', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    await controllerJoin(phone, code, 'Nova');

    const phoneTry = await emitAck<SimpleAck>(phone, 'room:setBots', { count: 2 });
    expect(phoneTry).toMatchObject({ ok: false, code: 'NOT_HOST' });

    const tooMany = await emitAck<SimpleAck>(host, 'room:setBots', { count: MAX_BOTS_PER_ROOM + 1 });
    expect(tooMany).toMatchObject({ ok: false, code: 'INVALID_BOTS' });

    const ok = await emitAck<SimpleAck>(host, 'room:setBots', { count: 3 });
    expect(ok.ok).toBe(true);
    const room = server.roomManager.getRoom(code)!;
    expect(room.bots).toHaveLength(3);
    host.disconnect();
    phone.disconnect();
  });

  it('displaces a bot when a phone joins a full room and rejects a 9th phone', async () => {
    const { host, code } = await hostedRoom();
    await emitAck<SimpleAck>(host, 'room:setBots', { count: MAX_BOTS_PER_ROOM });
    const phones: Socket[] = [];
    for (let i = 0; i < MAX_PLAYERS_PER_ROOM; i++) {
      const phone = await connect();
      phones.push(phone);
      const ack = await controllerJoin(phone, code, `P${i}`);
      expect(ack.ok).toBe(true);
    }
    const room = server.roomManager.getRoom(code)!;
    expect(room.bots).toHaveLength(0);
    expect(room.shipCount).toBe(MAX_PLAYERS_PER_ROOM);

    const extra = await connect();
    const full = await controllerJoin(extra, code, 'Extra');
    expect(full).toMatchObject({ ok: false, code: 'ROOM_FULL' });
    host.disconnect();
    extra.disconnect();
    for (const phone of phones) phone.disconnect();
  });
});

describe('match state machine', () => {
  it('enforces host-only start and a 2-ship minimum', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    await controllerJoin(phone, code, 'Solo');

    const phoneStart = await emitAck<SimpleAck>(phone, 'match:start');
    expect(phoneStart).toMatchObject({ ok: false, code: 'NOT_HOST' });

    const tooFew = await emitAck<SimpleAck>(host, 'match:start');
    expect(tooFew).toMatchObject({ ok: false, code: 'NOT_ENOUGH_PLAYERS' });
    host.disconnect();
    phone.disconnect();
  });

  it('runs LOBBY → COUNTDOWN → ACTIVE; snapshots go to the host, status to phones', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    const joined = await controllerJoin(phone, code, 'Nova');
    if (!joined.ok) throw new Error('join failed');
    await emitAck<SimpleAck>(host, 'room:setBots', { count: 1 });

    let phoneGotSnapshot = false;
    phone.on('game:snapshot', () => {
      phoneGotSnapshot = true;
    });
    const phoneCountdown = waitFor<CountdownPayload>(phone, 'match:countdown');
    const hostStarted = waitFor<MatchStartedPayload>(host, 'match:started', COUNTDOWN_DURATION_MS + 4000);
    const start = await emitAck<SimpleAck>(host, 'match:start');
    expect(start.ok).toBe(true);
    expect((await phoneCountdown).durationMs).toBe(COUNTDOWN_DURATION_MS);

    const started = await hostStarted;
    expect(started.snapshot.players.map((p) => p.id)).toContain(joined.playerId);
    await waitFor<GameSnapshot>(host, 'game:snapshot');
    const state = await waitFor<ControllerState>(phone, 'controller:state');
    expect(state).toMatchObject({ status: 'ACTIVE', alive: true, totalPlayers: 2 });
    expect(phoneGotSnapshot).toBe(false);

    const restart = await emitAck<SimpleAck>(host, 'match:restart');
    expect(restart.ok).toBe(true);
    expect(server.roomManager.getRoom(code)!.status).toBe('LOBBY');
    host.disconnect();
    phone.disconnect();
  }, 15_000);

  it('lets phones join while a round is running', async () => {
    const { host, code } = await hostedRoom();
    await emitAck<SimpleAck>(host, 'room:setBots', { count: 2 });
    const hostStarted = waitFor<MatchStartedPayload>(host, 'match:started', COUNTDOWN_DURATION_MS + 4000);
    await emitAck<SimpleAck>(host, 'match:start');
    await hostStarted;

    const late = await connect();
    const ack = await controllerJoin(late, code, 'Late');
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    const state = await waitFor<ControllerState>(late, 'controller:state');
    expect(state.status).toBe('ACTIVE');
    host.disconnect();
    late.disconnect();
  }, 15_000);
});

describe('reconnects and leaving', () => {
  it('holds a disconnected phone slot and reclaims it with the player token', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    const first = await controllerJoin(phone, code, 'Nova');
    if (!first.ok) throw new Error('join failed');

    phone.disconnect();
    await sleep(100);
    const room = server.roomManager.getRoom(code)!;
    expect(room.getPlayer(first.playerId)?.isConnected).toBe(false);

    const again = await connect();
    const second = await controllerJoin(again, code, 'Nova', first.playerToken);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.playerId).toBe(first.playerId);
    expect(room.getPlayer(first.playerId)?.isConnected).toBe(true);
    expect(room.humans).toHaveLength(1);
    host.disconnect();
    again.disconnect();
  });

  it('keeps the room while the host reconnects and lets it resume with its token', async () => {
    const { host, code, hostToken } = await hostedRoom();
    host.disconnect();
    await sleep(100);
    const room = server.roomManager.getRoom(code);
    expect(room).toBeDefined();
    expect(room!.toRoomInfo().hostConnected).toBe(false);

    const screen = await connect();
    const wrong = await emitAck<HostAck>(screen, 'host:resume', { code, hostToken: 'x'.repeat(32) });
    expect(wrong).toMatchObject({ ok: false, code: 'NOT_HOST' });
    const resumed = await emitAck<HostAck>(screen, 'host:resume', { code, hostToken });
    expect(resumed.ok).toBe(true);
    expect(room!.toRoomInfo().hostConnected).toBe(true);
    screen.disconnect();
  });

  it('closes the room for every phone when the host leaves explicitly', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    await controllerJoin(phone, code, 'Nova');
    const closed = waitFor<RoomClosedPayload>(phone, 'room:closed');
    await emitAck<SimpleAck>(host, 'room:leave');
    expect((await closed).reason).toMatch(/host/i);
    expect(server.roomManager.getRoom(code)).toBeUndefined();
    host.disconnect();
    phone.disconnect();
  });

  it('removes a phone immediately when it leaves explicitly', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    await controllerJoin(phone, code, 'Nova');
    await emitAck<SimpleAck>(phone, 'room:leave');
    expect(server.roomManager.getRoom(code)!.humans).toHaveLength(0);
    host.disconnect();
    phone.disconnect();
  });
});

describe('input validation', () => {
  it('ignores input from the host screen and clamps analog values', async () => {
    const { host, code } = await hostedRoom();
    const phone = await connect();
    const joined = await controllerJoin(phone, code, 'Nova');
    if (!joined.ok) throw new Error('join failed');
    const base = { up: false, down: false, left: false, right: false, aimAngle: 0, shooting: true, sequence: 1 };

    host.emit('input:update', { ...base, moveX: 1, moveY: 0 });
    phone.emit('input:update', { ...base, moveX: 5, moveY: -9 });
    await sleep(100);
    const latest = server.roomManager.getRoom(code)!.getPlayer(joined.playerId)!.latestInput;
    expect(latest).toMatchObject({ moveX: 1, moveY: -1, shooting: true });

    // A quick tap (press then release before the next tick) still fires once.
    const room = server.roomManager.getRoom(code)!;
    room.getFreshInput(joined.playerId);
    phone.emit('input:update', { ...base, shooting: true, sequence: 10 });
    phone.emit('input:update', { ...base, shooting: false, sequence: 11 });
    await sleep(100);
    expect(room.getFreshInput(joined.playerId)?.shooting).toBe(true);
    expect(room.getFreshInput(joined.playerId)?.shooting).toBe(false);

    phone.emit('input:update', { ...base, aimAngle: Number.NaN, sequence: 2 });
    await sleep(100);
    expect(server.roomManager.getRoom(code)!.getPlayer(joined.playerId)!.latestInput?.sequence).toBe(11);
    host.disconnect();
    phone.disconnect();
  });
});
