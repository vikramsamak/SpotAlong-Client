from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.cache import CacheEntry
from ..utils import decode_token

router = APIRouter(prefix="/api/cache")


async def authenticate(request: Request):
    auth = request.headers.get("authorization", "")
    payload = decode_token(auth)
    if not payload:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return int(payload["sub"])


@router.get("/colors/{album_id}")
async def get_colors(album_id: str, request: Request, session: AsyncSession = Depends(get_db)):
    await authenticate(request)
    result = await session.execute(
        select(CacheEntry).where(CacheEntry.cache_key == f"album_colors:{album_id}")
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    return {"colors": entry.value}


@router.get("/album/{album_id}")
async def get_album(album_id: str, request: Request, session: AsyncSession = Depends(get_db)):
    await authenticate(request)
    result = await session.execute(
        select(CacheEntry).where(CacheEntry.cache_key == f"album_feather:{album_id}")
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    return {"image": entry.value}


@router.get("/name/{song_uri}")
async def get_song_name(song_uri: str, request: Request, session: AsyncSession = Depends(get_db)):
    await authenticate(request)
    result = await session.execute(
        select(CacheEntry).where(CacheEntry.cache_key == f"song_name:{song_uri}")
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    return {"name": entry.value}


@router.post("/precache")
async def precache(request: Request, session: AsyncSession = Depends(get_db)):
    await authenticate(request)
    return {"success": True}
