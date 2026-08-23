import { prisma } from '../utils/database.js';
import {
  createAccessToken,
  createRefreshToken,
  decodeToken,
  extractBearerToken,
  generateFriendCode,
  generateLoginCode
} from '../utils/tokens.js';
import { SpotifyOAuthService } from './spotifyOauth.js';
import { ApiError } from '../utils/http.js';

const LOGIN_CODE_TTL_MS = 5 * 60_000;

export interface LoginInitiation {
  authUrl: string;
  expiryTimestamp: number;
}

export async function initiateLogin(redirectUri: string): Promise<LoginInitiation> {
  const loginCode = generateLoginCode();
  const state = generateLoginCode();
  const expiry = new Date(Date.now() + LOGIN_CODE_TTL_MS);

  await prisma.user.create({
    data: {
      friendCode: generateFriendCode(),
      displayName: 'Pending',
      username: `pending-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      spotifyState: state,
      loginCode,
      loginCodeExpiry: expiry
    }
  });

  return {
    authUrl: SpotifyOAuthService.getAuthorizeUrl(state, redirectUri),
    expiryTimestamp: expiry.getTime()
  };
}

export async function handleSpotifyCallback(
  code: string,
  state: string,
  redirectUri: string
): Promise<string | null> {
  const user = await prisma.user.findFirst({ where: { spotifyState: state } });
  if (!user) return null;

  const tokens = await SpotifyOAuthService.exchangeCode(code, redirectUri);
  if (!tokens?.access_token) return null;

  const profile = await SpotifyOAuthService.getUserInfo(tokens.access_token);
  if (!profile) return null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      spotifyAccessToken: tokens.access_token,
      spotifyRefreshToken: tokens.refresh_token ?? user.spotifyRefreshToken,
      spotifyTokenExpiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      displayName: profile.display_name ?? user.displayName,
      username: profile.id,
      avatarUrl: profile.images?.[0]?.url ?? null
    }
  });

  return user.loginCode;
}

export interface RedeemResult {
  accessToken: string;
  refreshToken: string;
  timeout: number;
}

export async function redeemLoginCode(loginCode: string): Promise<RedeemResult | null> {
  const user = await prisma.user.findFirst({ where: { loginCode } });
  if (!user || !user.loginCodeExpiry || user.loginCodeExpiry.getTime() < Date.now()) {
    return null;
  }
  if (!user.spotifyAccessToken) return null;

  const access = createAccessToken(user.id);
  const refresh = createRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: access.token,
      refreshToken: refresh.token,
      tokenExpiry: access.expiry,
      loginCode: null,
      loginCodeExpiry: null
    }
  });

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    timeout: access.expiry.getTime()
  };
}

export interface RefreshResult {
  token: string;
  refreshToken: string;
  timeout: number;
}

export async function refreshTokens(
  oldAccessToken: string,
  oldRefreshToken: string
): Promise<RefreshResult | null> {
  const payload = decodeToken(oldRefreshToken);
  if (!payload || payload.type !== 'refresh') return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.refreshToken !== oldRefreshToken) return null;

  const access = createAccessToken(user.id);
  const refresh = createRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: access.token,
      refreshToken: refresh.token,
      tokenExpiry: access.expiry
    }
  });

  return {
    token: access.token,
    refreshToken: refresh.token,
    timeout: access.expiry.getTime()
  };
}

export async function checkEligible(token: string): Promise<boolean> {
  const payload = decodeToken(token);
  if (!payload || payload.type !== 'access') return false;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return false;
  return user.tokenExpiry ? user.tokenExpiry.getTime() > Date.now() : false;
}

export async function getUserIdFromAuthHeader(header: string | undefined): Promise<string> {
  const token = extractBearerToken(header);
  if (!token) throw new ApiError(401, 'Authorization token missing.');
  const payload = decodeToken(token);
  if (!payload || payload.type !== 'access') {
    throw new ApiError(401, 'Invalid or expired session token.');
  }
  return payload.sub;
}
