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
 * Spotify rejects `http://localhost` (HTTPS required except for the
 * 127.0.0.1 loopback), so derived hosts are normalized to 127.0.0.1.
 *
 * Priority:
 *  1. SPOTIFY_LOGIN_REDIRECT_URL env - exact URI, e.g. the SPA callback
 *     (http://127.0.0.1:5173/auth/callback) so the browser lands back on
 *     the web app instead of this server's JSON response.
 *  2. APP_BASE_URL env + /api/login/callback
 *  3. The host the request arrived on (works behind ngrok/nginx via
 *     x-forwarded-host/proto; requires trust proxy)
 *
 * Whatever URI is used must be registered verbatim in the Spotify dashboard.
 */
export function resolveRedirectUri(req: Request): string {
  const explicit = process.env.SPOTIFY_LOGIN_REDIRECT_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const base = process.env.APP_BASE_URL;
  if (base) return `${normalizeHost(base).replace(/\/$/, '')}/api/login/callback`;

  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? req.headers.host ?? 'localhost';
  return `${proto}://${normalizeHost(host)}/api/login/callback`;
}

/**
 * Maps `localhost` hosts/URLs to `127.0.0.1` because Spotify rejects
 * http://localhost redirect URIs while allowing the loopback IP.
 */
function normalizeHost(hostOrUrl: string): string {
  return hostOrUrl.replace(
    /^(https?:\/\/)?(www\.)?localhost(?=:|\/|$)/i,
    (_match, proto?: string, www?: string) => `${proto ?? ''}${www ?? ''}127.0.0.1`
  );
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
    const { code, state, redirect_uri } = req.query as {
      code?: string;
      state?: string;
      redirect_uri?: string;
    };
    if (!code || !state) {
      res.status(400).json({ detail: 'Missing code or state' });
      return;
    }
    // The SPA passes back the exact redirect_uri used during authorize so
    // the token exchange matches it even when hosts differ.
    const redirectUri = redirect_uri ?? resolveRedirectUri(req);

    const loginCode = await handleSpotifyCallback(code, state, redirectUri);
    if (!loginCode) {
      res.status(400).json({
        detail: `Authentication failed. Make sure "${redirectUri}" is registered in the Spotify developer dashboard redirect URIs.`
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
