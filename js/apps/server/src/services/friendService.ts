import { prisma } from '../utils/database.js';
import { ApiError } from '../utils/http.js';
import { toFriendPayload, toPublicUser } from './serializers.js';
import { emitToUser } from '../socketio/emitter.js';
import type { Friend, User } from '@spotalong/types';

export async function sendFriendRequest(userId: string, friendCode: string): Promise<string> {
  const target = await prisma.user.findUnique({ where: { friendCode: friendCode.toUpperCase() } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === userId) throw new ApiError(400, 'You cannot add yourself as a friend');

  const existing = await prisma.friend.findFirst({
    where: {
      OR: [
        { userId, friendId: target.id },
        { userId: target.id, friendId: userId }
      ]
    }
  });
  if (existing) {
    throw new ApiError(
      400,
      existing.status === 'accepted' ? 'Already friends' : 'A request already exists'
    );
  }

  await prisma.friend.createMany({
    data: [
      { userId, friendId: target.id, direction: 'sent', status: 'pending' },
      { userId: target.id, friendId: userId, direction: 'received', status: 'pending' }
    ]
  });

  const requester = await prisma.user.findUnique({ where: { id: userId } });
  if (requester) {
    emitToUser(target.id, 'new_request', {
      userId: target.id,
      friendId: requester.id,
      direction: 'received',
      status: 'pending',
      otherUser: toPublicUser(requester)
    });
  }

  return target.id;
}

export async function respondToFriendRequest(
  userId: string,
  requesterId: string,
  action: 'accept' | 'decline'
): Promise<void> {
  const status = action === 'accept' ? 'accepted' : 'declined';
  const result = await prisma.friend.updateMany({
    where: {
      OR: [
        { userId, friendId: requesterId },
        { userId: requesterId, friendId: userId }
      ],
      status: 'pending'
    },
    data: { status }
  });

  if (result.count === 0) throw new ApiError(404, 'Request not found');

  if (action === 'accept') {
    const [me, other] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.user.findUnique({ where: { id: requesterId } })
    ]);
    if (me && other) {
      emitToUser(userId, 'new_friend', toPublicUser(other));
      emitToUser(requesterId, 'new_friend', toPublicUser(me));
    }
  } else {
    emitToUser(requesterId, 'remove_request', { requesterId });
  }
}

export async function removeFriend(userId: string, friendCode: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { friendCode: friendCode.toUpperCase() } });
  if (!target) throw new ApiError(404, 'User not found');

  await prisma.listenSession.deleteMany({
    where: {
      OR: [
        { listenerId: userId, targetId: target.id },
        { listenerId: target.id, targetId: userId }
      ]
    }
  });

  await prisma.friend.deleteMany({
    where: {
      OR: [
        { userId, friendId: target.id },
        { userId: target.id, friendId: userId }
      ]
    }
  });

  const [me] = await Promise.all([prisma.user.findUnique({ where: { id: userId } })]);
  if (me) {
    emitToUser(target.id, 'remove_friend', toPublicUser(me));
  }
}

export interface FriendsData {
  friends: User[];
  friendRequests: Friend[];
  outboundFriendRequests: Friend[];
}

export async function getFriendsData(userId: string): Promise<FriendsData> {
  const rows = await prisma.friend.findMany({
    where: {
      OR: [{ userId }, { friendId: userId }]
    },
    include: { user: true, friend: true }
  });

  const friends: User[] = [];
  const friendRequests: Friend[] = [];
  const outboundFriendRequests: Friend[] = [];

  for (const row of rows) {
    if (row.userId !== userId) continue;

    if (row.status === 'accepted') {
      friends.push(toPublicUser(row.friend));
    } else if (row.status === 'pending') {
      if (row.direction === 'sent') {
        outboundFriendRequests.push(toFriendPayload(row));
      } else {
        friendRequests.push(toFriendPayload(row));
      }
    }
  }

  return { friends, friendRequests, outboundFriendRequests };
}
