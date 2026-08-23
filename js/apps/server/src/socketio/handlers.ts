import { Socket } from 'socket.io';
import { prisma } from '../utils/database.js';
import { toFriendWithUser, toPublicUser } from '../services/serializers.js';
import { assertFriendship } from '../services/listenService.js';
import type { AuthNamespace } from './emitter.js';


export async function fetchFriendsList(userId: string): Promise<ReturnType<typeof toPublicUser>[]> {
  const rows = await prisma.friend.findMany({
    where: { userId, status: 'accepted', direction: 'sent' },
    include: { friend: true }
  });
  return rows.map((row) => toPublicUser(row.friend));
}

export async function fetchIncomingRequests(userId: string) {
  const rows = await prisma.friend.findMany({
    where: { userId, status: 'pending', direction: 'received' },
    include: { friend: true }
  });
  return rows.map((row) => toFriendWithUser(row, row.friend));
}

export async function fetchOutgoingRequests(userId: string) {
  const rows = await prisma.friend.findMany({
    where: { userId, status: 'pending', direction: 'sent' },
    include: { friend: true }
  });
  return rows.map((row) => toFriendWithUser(row, row.friend));
}

export async function handleSocketConnection(socket: Socket, namespace: AuthNamespace) {
  const userId = socket.data.userId as string;

  // 1. Mark Online & Set up socket room join
  await prisma.user.update({
    where: { id: userId },
    data: { lastOnline: new Date() }
  });
  socket.join(`user:${userId}`);

  // 2. Fetch Sync Data in Parallel
  const [friends, incomingReqs, outgoingReqs] = await Promise.all([
    fetchFriendsList(userId),
    fetchIncomingRequests(userId),
    fetchOutgoingRequests(userId)
  ]);

  // 3. Emit Snapshot Sequentially
  socket.emit('Authorized', userId);
  socket.emit('friend_list', friends);
  socket.emit('friend_requests', incomingReqs);
  socket.emit('outbound_friend_requests', outgoingReqs);

  // 4. Wire up State Receivers
  registerEventHandlers(socket, namespace, userId);

  // 5. Handle Disconnect
  socket.on('disconnect', async () => {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { lastOnline: new Date() }
      });
    } catch (error) {
      console.error(`Failed to update presence for user ${userId}:`, error);
    }
  });
}

async function getPrivacyMode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { privacyMode: true } });
  return user?.privacyMode ?? 'friends';
}

function registerEventHandlers(socket: Socket, namespace: AuthNamespace, userId: string) {
  socket.on('send_current_state', async (data) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSongId: data.songId,
        lastProgress: Math.floor(data.progress),
        lastIsPlaying: data.isPlaying,
        lastOnline: new Date()
      }
    });

    if ((await getPrivacyMode(userId)) === 'none') {
      return;
    }

    const activeSessions = await prisma.listenSession.findMany({
      where: { targetId: userId, active: true },
      select: { listenerId: true }
    });

    for (const session of activeSessions) {
      namespace.to(`user:${session.listenerId}`).emit('listening_state', {
        userId,
        songId: data.songId,
        progress: data.progress,
        isPlaying: data.isPlaying,
        looping: data.looping
      });
    }
  });

  socket.on('start_listening', async (targetId: string) => {
    try {
      await assertFriendship(userId, targetId);
      await prisma.listenSession.upsert({
        where: { listenerId_targetId: { listenerId: userId, targetId } },
        update: { active: true },
        create: { listenerId: userId, targetId, active: true }
      });
      namespace.to(`user:${targetId}`).emit('start_listening_from_user', userId);
    } catch (error) {
      console.error(`start_listening failed for ${userId} -> ${targetId}:`, error);
    }
  });

  socket.on('end_listening', async (targetId: string) => {
    await prisma.listenSession.deleteMany({
      where: { listenerId: userId, targetId }
    });
    namespace.to(`user:${targetId}`).emit('end_listening_from_user', userId);
  });
}
