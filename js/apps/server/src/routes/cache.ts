import { Router } from 'express';
import { prisma } from '../utils/database.js';
import { asyncHandler } from '../utils/http.js';
import { getUserIdFromAuthHeader } from '../services/authService.js';

export const cacheRouter = Router();

cacheRouter.use(
  asyncHandler(async (req, _res, next) => {
    await getUserIdFromAuthHeader(req.headers.authorization);
    next();
  })
);

async function getEntryValue(key: string): Promise<string | null> {
  const entry = await prisma.cacheEntry.findUnique({ where: { key } });
  return entry?.value ?? null;
}

function parseJsonSafe(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

cacheRouter.get(
  '/colors/:albumId',
  asyncHandler(async (req, res) => {
    const value = await getEntryValue(`album_colors:${req.params.albumId}`);
    if (value === null) {
      res.status(404).json({ detail: 'Not found' });
      return;
    }
    res.json({ colors: parseJsonSafe(value) });
  })
);

cacheRouter.get(
  '/album/:albumId',
  asyncHandler(async (req, res) => {
    const value = await getEntryValue(`album_feather:${req.params.albumId}`);
    if (value === null) {
      res.status(404).json({ detail: 'Not found' });
      return;
    }
    res.json({ image: parseJsonSafe(value) });
  })
);

cacheRouter.get(
  '/name/:songUri',
  asyncHandler(async (req, res) => {
    const value = await getEntryValue(`song_name:${req.params.songUri}`);
    if (value === null) {
      res.status(404).json({ detail: 'Not found' });
      return;
    }
    const parsed = parseJsonSafe(value);
    res.json({ name: typeof parsed === 'string' ? parsed : JSON.stringify(parsed) });
  })
);

cacheRouter.post(
  '/precache',
  asyncHandler(async (_req, res) => {
    res.json({ success: true });
  })
);
