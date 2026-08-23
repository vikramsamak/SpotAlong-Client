import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';

process.env.JWT_SECRET = 'test-secret';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn((args: { where: { id: string } }) =>
        Promise.resolve({ id: args.where.id })),
      update: vi.fn(() => Promise.resolve({}))
    },
    listenSession: {
      findMany: vi.fn(() => Promise.resolve([{ listenerId: 'MOCK_LISTENER_ID' }])),
      upsert: vi.fn(() => Promise.resolve({})),
      update: vi.fn(() => Promise.resolve({}))
    }
  }
}));

vi.mock('../src/utils/database.js', () => ({ prisma: prismaMock }));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn((token: string) => {
      if (token === 'MOCK_HOST_JWT') return { sub: 'MOCK_HOST_ID', type: 'access' };
      if (token === 'MOCK_LISTENER_JWT') return { sub: 'MOCK_LISTENER_ID', type: 'access' };
      throw new Error('Invalid token');
    })
  }
}));

import { initSocketIOServer } from '../src/socketio/server.js';
import type { Server as SocketIOServer } from 'socket.io';

describe('Realtime Broadcast Performance', () => {
  let ioServer: SocketIOServer, httpServer: ReturnType<typeof createServer>;
  let hostSocket: ClientSocket, listenerSocket: ClientSocket;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    ioServer = initSocketIOServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    hostSocket?.disconnect();
    listenerSocket?.disconnect();
    ioServer.close();
    httpServer.close();
    vi.restoreAllMocks();
  });

  it('should broadcast song_update packets from host to active listener with low delay', (done) => {
    hostSocket = ioc(`http://localhost:${port}/api/authorization`, {
      extraHeaders: { Authorization: 'Bearer MOCK_HOST_JWT' }
    });

    listenerSocket = ioc(`http://localhost:${port}/api/authorization`, {
      extraHeaders: { Authorization: 'Bearer MOCK_LISTENER_JWT' }
    });

    listenerSocket.on('listening_state', (payload) => {
      expect(payload.songId).toBe('spotify:track:4zCHp6vNfN57T63A99Dq2b');
      expect(payload.progress).toBe(120);
      expect(payload.isPlaying).toBe(true);
      done();
    });

    listenerSocket.on('connect', () => {
      listenerSocket.emit('start_listening', 'MOCK_HOST_ID');
    });

    hostSocket.on('connect', () => {
      setTimeout(() => {
        hostSocket.emit('send_current_state', {
          songId: 'spotify:track:4zCHp6vNfN57T63A99Dq2b',
          progress: 120,
          isPlaying: true,
          looping: 'track'
        });
      }, 100);
    });
  });
});
