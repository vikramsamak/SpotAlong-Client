import { describe, it, afterAll, expect, vi } from 'vitest';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(() => Promise.resolve(null))
    },
    friend: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      findMany: vi.fn(() => Promise.resolve([])),
      createMany: vi.fn(() => Promise.resolve({ count: 2 })),
      updateMany: vi.fn(() => Promise.resolve({ count: 2 })),
      deleteMany: vi.fn(() => Promise.resolve({ count: 2 }))
    }
  }
}));

vi.mock('../src/utils/database.js', () => ({ prisma: prismaMock }));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn((_token: string) => ({ sub: 'me-id', type: 'access' })),
    sign: vi.fn(() => 'signed-token')
  }
}));

import { createApp } from '../src/app.js';

const auth = { Authorization: 'Bearer valid-token' };

describe('Friends routes', () => {
  const app = createApp();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/friends/request/:friendCode creates both pending rows', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'target-id',
      friendCode: 'ABC123'
    });

    const res = await request(app)
      .post('/api/friends/request/ABC123')
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body.friendId).toBe('target-id');
    expect(prismaMock.friend.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'me-id', friendId: 'target-id', direction: 'sent', status: 'pending' },
        { userId: 'target-id', friendId: 'me-id', direction: 'received', status: 'pending' }
      ]
    });
  });

  it('POST /api/friends/request/:friendCode rejects adding yourself', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'me-id',
      friendCode: 'SELFME'
    });

    const res = await request(app).post('/api/friends/request/SELFME').set(auth);
    expect(res.status).toBe(400);
  });

  it('GET /api/friends returns serialized lists without leaking tokens', async () => {
    prismaMock.friend.findMany.mockResolvedValueOnce([
      {
        id: 'row-1',
        userId: 'me-id',
        friendId: 'friend-1',
        direction: 'sent',
        status: 'accepted',
        user: { id: 'me-id' },
        friend: {
          id: 'friend-1',
          friendCode: 'FRND01',
          displayName: 'Friend One',
          username: 'friendone',
          avatarUrl: null,
          accessToken: 'SECRET-SHOULD-NOT-LEAK',
          refreshToken: 'SECRET-SHOULD-NOT-LEAK',
          spotifyAccessToken: 'SECRET-SHOULD-NOT-LEAK',
          privacyMode: 'friends'
        }
      },
      {
        id: 'row-2',
        userId: 'me-id',
        friendId: 'friend-2',
        direction: 'received',
        status: 'pending',
        user: { id: 'me-id' },
        friend: {
          id: 'friend-2',
          friendCode: 'FRND02',
          displayName: 'Friend Two',
          username: 'friendtwo',
          privacyMode: 'friends'
        }
      },
      {
        id: 'row-3',
        userId: 'me-id',
        friendId: 'friend-3',
        direction: 'sent',
        status: 'pending',
        user: { id: 'me-id' },
        friend: {
          id: 'friend-3',
          friendCode: 'FRND03',
          displayName: 'Friend Three',
          username: 'friendthree',
          privacyMode: 'friends'
        }
      }
    ]);

    const res = await request(app).get('/api/friends').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.friends).toHaveLength(1);
    expect(res.body.friends[0]).toMatchObject({
      id: 'friend-1',
      friendCode: 'FRND01',
      displayName: 'Friend One'
    });
    expect(res.body.friendRequests).toHaveLength(1);
    expect(res.body.outboundFriendRequests).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('SECRET-SHOULD-NOT-LEAK');
  });

  it('POST /api/friends/respond/:requesterId validates the action', async () => {
    const res = await request(app)
      .post('/api/friends/respond/requester-1')
      .set(auth)
      .send({ action: 'hug' });
    expect(res.status).toBe(400);
  });
});
