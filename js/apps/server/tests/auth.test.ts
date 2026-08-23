import { describe, it, afterAll, expect, vi } from 'vitest';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      create: vi.fn(() =>
        Promise.resolve({
          id: 'user-1',
          loginCode: '123456',
          loginCodeExpiry: new Date(Date.now() + 5 * 60_000),
          spotifyAccessToken: 'spotify-token'
        })
      ),
      findFirst: vi.fn(() => Promise.resolve(null)),
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'user-1', ...args.data }))
    }
  }
}));

vi.mock('../src/utils/database.js', () => ({ prisma: prismaMock }));

import { createApp } from '../src/app.js';

describe('Auth routes', () => {
  const app = createApp();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/login returns an auth url and expiry timestamp', async () => {
    const res = await request(app).get('/api/login');
    expect(res.status).toBe(200);
    expect(res.body.authUrl).toContain('https://accounts.spotify.com/authorize');
    expect(res.body.authUrl).toContain('state=');
    expect(typeof res.body.expiryTimestamp).toBe('number');
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
  });

  it('GET /api/login/redeem_code issues app tokens for a valid code', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'user-9',
      loginCode: '654321',
      loginCodeExpiry: new Date(Date.now() + 60_000),
      spotifyAccessToken: 'spotify-token'
    });

    const res = await request(app).get('/api/login/redeem_code').query({ code: '654321' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(typeof res.body.timeout).toBe('number');
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-9' },
        data: expect.objectContaining({ loginCode: null, loginCodeExpiry: null })
      })
    );
  });

  it('GET /api/login/redeem_code rejects expired codes', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: 'user-8',
      loginCode: '111111',
      loginCodeExpiry: new Date(Date.now() - 60_000),
      spotifyAccessToken: 'spotify-token'
    });

    const res = await request(app).get('/api/login/redeem_code').query({ code: '111111' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Invalid or expired code');
  });

  it('GET /api/login/eligible requires a bearer token', async () => {
    const res = await request(app).get('/api/login/eligible');
    expect(res.status).toBe(401);
  });
});
