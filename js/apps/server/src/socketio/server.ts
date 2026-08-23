import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/database.js';
import {
  ServerToClientEvents,
  ClientToServerEvents
} from '@spotalong/types';
import { handleSocketConnection } from './handlers.js';
import { setAuthNamespace } from './emitter.js';

export function initSocketIOServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: '/socket.io'
  });

  const authNamespace = io.of('/api/authorization');

  authNamespace.use(async (socket, next) => {
    const authHeader = socket.handshake.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new Error('Authentication error: Missing token'));
    }

    const token = authHeader.split(' ')[1];
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    } catch {
      return next(new Error('Authentication error: Token invalid or expired'));
    }
    if (decoded.type !== 'access' || typeof decoded.sub !== 'string') {
      return next(new Error('Authentication error: Invalid token type'));
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('Authentication error: User lookup failed'));
    }
  });

  authNamespace.on('connection', (socket) => {
    handleSocketConnection(socket, authNamespace);
  });

  setAuthNamespace(authNamespace);

  return io;
}
