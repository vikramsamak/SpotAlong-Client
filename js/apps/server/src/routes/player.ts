import { Router } from 'express';
import { ApiError, asyncHandler } from '../utils/http.js';
import { getUserIdFromAuthHeader } from '../services/authService.js';
import { getListenersOf } from '../services/listenService.js';
import { playerSessions } from '../services/player/PlayerSessionManager.js';
import { SpotifyPlayerEngine } from '../services/player/SpotifyPlayerEngine.js';
import { describeCookieScanFailure, getSpotifySPTCookie } from '../services/player/cookieScanner.js';
import { emitToUser } from '../socketio/emitter.js';

let broadcasterAttached = false;

function ensureBroadcaster(): void {
  if (broadcasterAttached) return;
  broadcasterAttached = true;

  playerSessions.onState = async (userId, state) => {
    try {
      const listeners = await getListenersOf(userId);
      for (const listenerId of listeners) {
        emitToUser(listenerId, 'player_state', { userId, state });
      }
    } catch (error) {
      console.error(`Failed to broadcast player state for ${userId}:`, error);
    }
  };

  playerSessions.onStopped = async (userId) => {
    try {
      const listeners = await getListenersOf(userId);
      for (const listenerId of listeners) {
        emitToUser(listenerId, 'player_stopped', { userId });
      }
    } catch (error) {
      console.error(`Failed to broadcast player stop for ${userId}:`, error);
    }
  };
}

interface CommandBody {
  action?:
    | 'pause'
    | 'resume'
    | 'next'
    | 'previous'
    | 'seek'
    | 'play'
    | 'queue'
    | 'shuffle'
    | 'repeat'
    | 'transfer'
    | 'volume';
  value?: unknown;
}

export const playerRouter = Router();

playerRouter.use(
  asyncHandler(async (req, _res, next) => {
    ensureBroadcaster();
    await getUserIdFromAuthHeader(req.headers.authorization);
    next();
  })
);

playerRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
      const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    const { cookie } = (req.body ?? {}) as { cookie?: string };
    let spTCookie = cookie;

    if (!spTCookie) {
      const scanned = await getSpotifySPTCookie();
      if (!scanned.spTCookie) {
        throw new ApiError(400, describeCookieScanFailure(scanned.reason));
      }
      spTCookie = scanned.spTCookie;
    }

    try {
      const state = await playerSessions.start(userId, spTCookie);
      res.json({ active: true, deviceId: undefined, state });
    } catch (error) {
      console.error(`Failed to start player session for ${userId}:`, error);
      throw new ApiError(502, 'Could not establish Spotify player session');
    }
  })
);

playerRouter.post(
  '/stop',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    await playerSessions.stop(userId);
    res.json({ success: true });
  })
);

playerRouter.get(
  '/state',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    const engine = playerSessions.get(userId);
    if (!engine) {
      res.json({ active: false });
      return;
    }
    res.json({ active: true, state: engine.getSnapshot() });
  })
);

playerRouter.get(
  '/devices',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    const engine = playerSessions.get(userId);
    if (!engine) {
      res.json({ active: false, devices: [] });
      return;
    }
    res.json({ active: true, devices: engine.getDevices() });
  })
);

playerRouter.post(
  '/command',
  asyncHandler(async (req, res) => {
    const userId = await getUserIdFromAuthHeader(req.headers.authorization);
    const engine = playerSessions.get(userId);
    if (!engine) throw new ApiError(404, 'No active player session');

    const { action, value } = (req.body ?? {}) as CommandBody;
    switch (action) {
      case 'pause':
        await engine.command(SpotifyPlayerEngine.pause());
        break;
      case 'resume':
        await engine.command(SpotifyPlayerEngine.resume());
        break;
      case 'next':
        await engine.command(SpotifyPlayerEngine.skipNext());
        break;
      case 'previous':
        await engine.command(SpotifyPlayerEngine.skipPrev());
        break;
      case 'seek':
        if (typeof value !== 'number') throw new ApiError(400, 'seek requires numeric ms value');
        await engine.command(SpotifyPlayerEngine.seekTo(value));
        break;
      case 'play':
        if (typeof value !== 'string') throw new ApiError(400, 'play requires a track id');
        await engine.command(SpotifyPlayerEngine.play(value));
        break;
      case 'queue':
        if (typeof value !== 'string') throw new ApiError(400, 'queue requires a track id');
        await engine.command(SpotifyPlayerEngine.addToQueue(value));
        break;
      case 'shuffle':
        await engine.command(SpotifyPlayerEngine.setShuffle(Boolean(value)));
        break;
      case 'repeat': {
        const mode = value === 'track' ? 'track' : value === 'context' ? 'context' : 'off';
        await engine.command(SpotifyPlayerEngine.setRepeat(mode));
        break;
      }
      case 'transfer':
        if (typeof value !== 'string') throw new ApiError(400, 'transfer requires a device id');
        await engine.transfer(value);
        break;
      case 'volume':
        if (typeof value !== 'number') throw new ApiError(400, 'volume requires a percent value');
        await engine.setVolume(value);
        break;
      default:
        throw new ApiError(400, 'Unknown player action');
    }

    res.json({ success: true, state: engine.getSnapshot() });
  })
);
