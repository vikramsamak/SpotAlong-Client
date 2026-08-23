import express from 'express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './utils/http.js';
import { authRouter } from './routes/auth.js';
import { friendsRouter } from './routes/friends.js';
import { meRouter } from './routes/me.js';
import { cacheRouter } from './routes/cache.js';
import { playerRouter } from './routes/player.js';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/login', authRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/me', meRouter);
  app.use('/api/cache', cacheRouter);
  app.use('/api/player', playerRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ detail: err.message });
      return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ detail: 'Internal server error' });
  });

  return app;
}
