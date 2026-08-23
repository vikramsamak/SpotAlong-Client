import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_EXPIRE_MINUTES = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES ?? 30);
const REFRESH_TOKEN_EXPIRE_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS ?? 7);

export interface SpotAlongJwtPayload {
  sub: string;
  type: 'access' | 'refresh';
  exp: number;
  iat?: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

export function generateFriendCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function generateLoginCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export interface IssuedToken {
  token: string;
  expiry: Date;
}

export function createAccessToken(userId: string): IssuedToken {
  const expiry = new Date(Date.now() + ACCESS_TOKEN_EXPIRE_MINUTES * 60_000);
  const token = jwt.sign({ sub: userId, type: 'access' }, getSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRE_MINUTES * 60
  });
  return { token, expiry };
}

export function createRefreshToken(userId: string): IssuedToken {
  const expiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRE_DAYS * 86_400_000);
  const token = jwt.sign({ sub: userId, type: 'refresh' }, getSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRE_DAYS * 86_400
  });
  return { token, expiry };
}

export function decodeToken(token: string): SpotAlongJwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded === 'string') return null;
    if (typeof decoded.sub !== 'string') return null;
    if (decoded.type !== 'access' && decoded.type !== 'refresh') return null;
    return decoded as unknown as SpotAlongJwtPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}
