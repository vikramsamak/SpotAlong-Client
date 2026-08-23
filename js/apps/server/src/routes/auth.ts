import { Router } from 'express';
import type { Request } from 'express';
import { asyncHandler } from '../utils/http.js';
import {
  checkEligible,
  handleSpotifyCallback,
  initiateLogin,
  redeemLoginCode,
  refreshTokens
} from '../services/authService.js';

export const authRouter = Router();

/**
 * Resolves the Spotify redirect URI for the current request.
 *
 * Priority:
 *  1. APP_BASE_URL env (deterministic override)
 *  2. The host the request actually arrived on (works behind ngrok/nginx
 *     via x-forwarded-host/x-forwarded-proto, requires trust proxy)
 *
 * Keeping authorize + token exchange on the same per-request URI is what
 * makes "redirect_uri: Not matching configuration" impossible between the
 * two calls; the URI still has to be registered in the Spotify dashboard.
 */
export function resolveRedirectUri(req: Request): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return `${configured.replace(/\/$/, '')}/api/login/callback`;

  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? req.headers.host;
  return `${proto}://${host}/api/login/callback`;
}

authRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const redirectUri = resolveRedirectUri(req);
    const result = await initiateLogin(redirectUri);
    res.json({ ...result, redirect_uri: redirectUri });
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
    const loginCode = await handleSpotifyCallback(code, state, resolveRedirectUri(req));
    if (!loginCode) {
      res.status(400).json({
        detail: `Authentication failed. Make sure "${resolveRedirectUri(req)}" is registered in the Spotify developer dashboard redirect URIs.`
      });
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
