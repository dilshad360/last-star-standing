import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  CountdownPayload,
  GameSnapshot,
  JoinAck,
  MatchResult,
  MatchStartedPayload,
  RoomInfo,
  ServerToClientEvents,
  SimpleAck,
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
      () => reject(new Error(`Timed out waiting for "${String(event)}" after ${ms}ms`)),
      ms,
    );
    const listener = socket as unknown as {
      once: (event: string, cb: (payload: T) => void) => void;
    };
    listener.once(event as string, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Phase 6: Multi-Client Socket.IO End-to-End Match Integration', () => {
  it('runs complete multi-player lobby lifecycle: create, join, ready, countdown, match, input, and restart', async () => {
    const hostSocket = await connect();
    const guestSocket = await connect();

    // 1. Host creates room
    const hostAck = await emitAck<JoinAck>(hostSocket, 'room:create', { displayName: 'Viper' });
    expect(hostAck.ok).toBe(true);
    if (!hostAck.ok) throw new Error(hostAck.error);
    const roomCode = hostAck.room.code;
    expect(roomCode).toHaveLength(4);

    // 2. Guest joins with roomCode
    const guestAck = await emitAck<JoinAck>(guestSocket, 'room:join', {
      code: roomCode,
      displayName: 'Phoenix',
    });
    expect(guestAck.ok).toBe(true);
    if (!guestAck.ok) throw new Error(guestAck.error);

    // 3. Host sets 2 AI bots
    const botAck = await emitAck<SimpleAck>(hostSocket, 'room:setBots', { count: 2 });
    expect(botAck.ok).toBe(true);

    // 4. Guest sets ready
    const readyAck = await emitAck<SimpleAck>(guestSocket, 'player:ready', { ready: true });
    expect(readyAck.ok).toBe(true);

    // 5. Host launches match → listen for countdown on both sockets
    const countdownPromiseHost = waitFor<CountdownPayload>(hostSocket, 'match:countdown');
    const countdownPromiseGuest = waitFor<CountdownPayload>(guestSocket, 'match:countdown');

    const startAck = await emitAck<SimpleAck>(hostSocket, 'match:start');
    expect(startAck.ok).toBe(true);

    const [cdHost, cdGuest] = await Promise.all([countdownPromiseHost, countdownPromiseGuest]);
    expect(cdHost.durationMs).toBeGreaterThan(0);
    expect(cdGuest.durationMs).toBeGreaterThan(0);

    // 6. Match started broadcast arrives with initial snapshot
    const startedPromiseHost = waitFor<MatchStartedPayload>(hostSocket, 'match:started', 5000);
    const startedPromiseGuest = waitFor<MatchStartedPayload>(guestSocket, 'match:started', 5000);
    const [startedHost, startedGuest] = await Promise.all([startedPromiseHost, startedPromiseGuest]);

    expect(startedHost.snapshot.status).toBe('ACTIVE');
    expect(startedGuest.snapshot.status).toBe('ACTIVE');
    // Total combatants: 2 humans + 2 bots = 4
    expect(startedHost.snapshot.players).toHaveLength(4);

    // 7. Receive live 25 Hz snapshots and send player inputs
    const snapshotPromise = waitFor<GameSnapshot>(hostSocket, 'game:snapshot', 3000);
    hostSocket.emit('input:update', {
      up: true,
      down: false,
      left: false,
      right: false,
      aimAngle: 0.5,
      shooting: true,
      sequence: 1,
    });

    const liveSnapshot = await snapshotPromise;
    expect(liveSnapshot.tick).toBeGreaterThan(0);
    expect(liveSnapshot.safeZone.radius).toBeGreaterThan(0);
    expect(liveSnapshot.asteroids.length).toBeGreaterThan(0);

    // 8. Host restarts match back to lobby
    const restartPromiseHost = waitFor<RoomInfo>(hostSocket, 'room:updated', 4000);
    const restartPromiseGuest = waitFor<RoomInfo>(guestSocket, 'room:updated', 4000);

    const restartAck = await emitAck<SimpleAck>(hostSocket, 'match:restart');
    expect(restartAck.ok).toBe(true);

    const [restartedRoomHost, restartedRoomGuest] = await Promise.all([
      restartPromiseHost,
      restartPromiseGuest,
    ]);
    expect(restartedRoomHost.status).toBe('LOBBY');
    expect(restartedRoomGuest.status).toBe('LOBBY');

    hostSocket.disconnect();
    guestSocket.disconnect();
  });

  it('runs Quick Play flow with automatic bot deployment', async () => {
    const socket = await connect();
    const ack = await emitAck<JoinAck>(socket, 'room:quickPlay', {
      displayName: 'SoloAce',
      botCount: 3,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) throw new Error(ack.error);

    expect(ack.room.botCount).toBe(3);
    expect(ack.room.players.filter((p) => !p.isBot)).toHaveLength(1);
    expect(ack.room.players.filter((p) => p.isBot)).toHaveLength(3);
    const human = ack.room.players.find((p) => !p.isBot)!;
    expect(human.displayName).toBe('SoloAce');

    socket.disconnect();
  });

  it('rejects invalid actions from non-host players', async () => {
    const hostSocket = await connect();
    const guestSocket = await connect();

    const hostAck = await emitAck<JoinAck>(hostSocket, 'room:create', { displayName: 'RealHost' });
    if (!hostAck.ok) throw new Error(hostAck.error);

    await emitAck<JoinAck>(guestSocket, 'room:join', {
      code: hostAck.room.code,
      displayName: 'SneakyGuest',
    });

    // Guest tries to set bots -> should fail
    const botAck = await emitAck<SimpleAck>(guestSocket, 'room:setBots', { count: 5 });
    expect(botAck.ok).toBe(false);

    // Guest tries to start match -> should fail
    const startAck = await emitAck<SimpleAck>(guestSocket, 'match:start');
    expect(startAck.ok).toBe(false);

    hostSocket.disconnect();
    guestSocket.disconnect();
  });
});
