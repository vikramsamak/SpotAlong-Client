import 'dotenv/config';
import { createServer } from 'http';
import type { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { initSocketIOServer } from './socketio/server.js';
import { startTunnel, stopTunnel } from './services/tunnelService.js';
import { prisma } from './utils/database.js';

const port = Number(process.env.PORT ?? 3000);

const app = createApp();
const httpServer = createServer(app);

let io: SocketIOServer | undefined;

async function start() {
  io = initSocketIOServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`SpotAlong server listening on http://localhost:${port}`);
  });

  await new Promise<void>((resolve) => httpServer.once('listening', resolve));
  await startTunnel(port);
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  await stopTunnel();
  httpServer.close();
  io?.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch(async (err) => {
  console.error('Fatal startup error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
