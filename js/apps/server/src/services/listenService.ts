import { prisma } from '../utils/database.js';
import { ApiError } from '../utils/http.js';

export async function assertFriendship(aId: string, bId: string): Promise<void> {
  const link = await prisma.friend.findFirst({
    where: {
      OR: [
        { userId: aId, friendId: bId },
        { userId: bId, friendId: aId }
      ],
      status: 'accepted'
    }
  });
  if (!link) throw new ApiError(403, 'You are not friends with this user');
}

export async function startListening(listenerId: string, targetId: string): Promise<void> {
  await assertFriendship(listenerId, targetId);
  await prisma.listenSession.upsert({
    where: { listenerId_targetId: { listenerId, targetId } },
    create: { listenerId, targetId, active: true },
    update: { active: true }
  });
}

export async function endListening(listenerId: string, targetId: string): Promise<void> {
  const session = await prisma.listenSession.findUnique({
    where: { listenerId_targetId: { listenerId, targetId } }
  });
  if (!session) throw new ApiError(404, 'No active listening session');
  await prisma.listenSession.delete({ where: { id: session.id } });
}

export async function updateSessionState(
  listenerId: string,
  stateJson: unknown
): Promise<void> {
  await prisma.listenSession.updateMany({
    where: { listenerId, active: true },
    data: { state: JSON.stringify(stateJson) }
  });
}

export async function getListenersOf(targetId: string): Promise<string[]> {
  const sessions = await prisma.listenSession.findMany({
    where: { targetId, active: true }
  });
  return sessions.map((s) => s.listenerId);
}

export async function getListenTargetsOf(listenerId: string): Promise<string[]> {
  const sessions = await prisma.listenSession.findMany({
    where: { listenerId, active: true }
  });
  return sessions.map((s) => s.targetId);
}
