import type { User as PrismaUser, Friend as PrismaFriend } from '../generated/prisma/client.js';
import type { User, Friend } from '@spotalong/types';

export function toPublicUser(user: PrismaUser): User {
  return {
    id: user.id,
    friendCode: user.friendCode,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl ?? undefined,
    lastOnline: user.lastOnline ? user.lastOnline.toISOString() : undefined,
    lastSongId: user.lastSongId ?? undefined,
    lastProgress: user.lastProgress ?? undefined,
    lastIsPlaying: user.lastIsPlaying ?? undefined,
    privacyMode: (['friends', 'none', 'everyone'] as const).includes(user.privacyMode as User['privacyMode'])
      ? (user.privacyMode as User['privacyMode'])
      : 'friends'
  };
}

export function toFriendPayload(row: PrismaFriend): Friend {
  return {
    userId: row.userId,
    friendId: row.friendId,
    direction: row.direction === 'received' ? 'received' : 'sent',
    status: row.status === 'accepted' ? 'accepted' : row.status === 'declined' ? 'declined' : 'pending'
  };
}

export function toFriendWithUser(row: PrismaFriend, other: PrismaUser): Friend {
  return {
    ...toFriendPayload(row),
    otherUser: toPublicUser(other)
  };
}
