import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@lss/shared';
import { env } from './config/env.js';
import { createWorldSimulation } from './game/WorldSimulation.js';
import { registerSocketHandlers } from './networking/socketHandlers.js';
import { RoomManager } from './rooms/RoomManager.js';
import type { SimulationFactory, TypedServer } from './rooms/GameRoom.js';

export interface GameServer {
  httpServer: HttpServer;
  io: TypedServer;
  roomManager: RoomManager;
}

export function createGameServer(simulationFactory?: SimulationFactory): GameServer {
  const app = express();
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json());

  const httpServer = createHttpServer(app);
  const io: TypedServer = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: { origin: env.corsOrigins, methods: ['GET', 'POST'] },
    },
  );
  const roomManager = new RoomManager(
    io,
    simulationFactory ?? ((room) => createWorldSimulation(room, io)),
  );

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      rooms: roomManager.roomCount,
      players: roomManager.playerCount,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/api/network', (_req, res) => {
    const interfaces = os.networkInterfaces();
    const ips: Array<{ name: string; ip: string }> = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push({ name, ip: net.address });
        }
      }
    }
    res.json({ ips });
  });

  io.on('connection', (socket) => registerSocketHandlers(socket, roomManager));

  return { httpServer, io, roomManager };
}

const invokedAs = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedAs) {
  const { httpServer } = createGameServer();
  httpServer.listen(env.port, () => {
    console.log(
      `[lss-server] listening on http://localhost:${env.port} (env: ${env.nodeEnv})`,
    );
    console.log(`[lss-server] health check: http://localhost:${env.port}/health`);
  });
}
