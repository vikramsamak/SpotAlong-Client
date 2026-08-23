import { Request, Response, NextFunction } from 'express';
import { decodeToken } from '../utils/tokens.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    res.status(401).json({ detail: 'Authorization token missing.' });
    return;
  }

  const payload = decodeToken(token);
  if (!payload || payload.type !== 'access') {
    res.status(401).json({ detail: 'Invalid or expired session token.' });
    return;
  }

  req.userId = payload.sub;
  next();
}
