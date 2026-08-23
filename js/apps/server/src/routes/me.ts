import { Router } from 'express';
import { prisma } from '../utils/database.js';
import { asyncHandler } from '../utils/http.js';
import { getUserIdFromAuthHeader } from '../services/authService.js';

export const meRouter = Router();

meRouter.post(
  '/status_broadcast',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ detail: 'User not found' });
      return;
    }

    const { privacyMode } = (req.body ?? {}) as { privacyMode?: string };
    if (privacyMode !== undefined) {
      if (!['friends', 'none', 'everyone'].includes(privacyMode)) {
        res.status(400).json({ detail: 'Invalid privacy_mode value' });
        return;
      }
      await prisma.user.update({ where: { id: userId }, data: { privacyMode } });
    }

    res.json({ success: true });
  })
);
