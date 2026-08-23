import { Router } from 'express';
import { asyncHandler, ApiError } from '../utils/http.js';
import { getUserIdFromAuthHeader } from '../services/authService.js';
import {
  getFriendsData,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest
} from '../services/friendService.js';

export const friendsRouter = Router();

friendsRouter.use(
  asyncHandler(async (req, _res, next) => {
    await getUserIdFromAuthHeader(req.headers.authorization);
    next();
  })
);

friendsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    res.json(await getFriendsData(userId));
  })
);

friendsRouter.post(
  '/request/:friendCode',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    const friendId = await sendFriendRequest(userId, String(req.params.friendCode));
    res.json({ friendId });
  })
);

friendsRouter.post(
  '/respond/:requesterId',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    const action = req.body?.action;
    if (action !== 'accept' && action !== 'decline') {
      throw new ApiError(400, "action must be 'accept' or 'decline'");
    }
    await respondToFriendRequest(userId, String(req.params.requesterId), action);
    res.json({ success: true });
  })
);

friendsRouter.post(
  '/remove/:friendCode',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    await removeFriend(userId, String(req.params.friendCode));
    res.json({ success: true });
  })
);
