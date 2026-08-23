import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import {
  checkEligible,
  handleSpotifyCallback,
  initiateLogin,
  redeemLoginCode,
  refreshTokens
} from '../services/authService.js';

export const authRouter = Router();

authRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await initiateLogin();
    res.json(result);
  })
);

authRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      res.status(400).json({ detail: 'Missing code or state' });
      return;
    }
    const loginCode = await handleSpotifyCallback(code, state);
    if (!loginCode) {
      res.status(400).json({ detail: 'Authentication failed' });
      return;
    }
    res.json({ message: 'Authenticated', code: loginCode });
  })
);

authRouter.get(
  '/redeem_code',
  asyncHandler(async (req, res) => {
    const { code } = req.query as { code?: string };
    if (!code) {
      res.status(400).json({ detail: 'Missing code' });
      return;
    }
    const result = await redeemLoginCode(code);
    if (!result) {
      res.status(400).json({ detail: 'Invalid or expired code' });
      return;
    }
    res.json(result);
  })
);

authRouter.get(
  '/eligible',
  asyncHandler(async (req, res) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const ok = await checkEligible(token);
    if (!ok) {
      res.status(401).json({ detail: 'Timed out.' });
      return;
    }
    res.json({ eligible: true });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken } = req.body as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (!accessToken || !refreshToken) {
      res.status(400).json({ detail: 'Missing tokens' });
      return;
    }
    const result = await refreshTokens(accessToken, refreshToken);
    if (!result) {
      res.status(401).json({ detail: 'Refresh failed' });
      return;
    }
    res.json(result);
  })
);
