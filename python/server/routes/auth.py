import time
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.user import User
from ..schemas.auth import RedeemRequest, RefreshRequest
from ..services.auth_service import (
    initiate_login,
    handle_spotify_callback,
    redeem_login_code,
    refresh_access_token,
    check_eligible,
)
from ..config import settings

router = APIRouter(prefix="/api/login")


@router.get("")
async def login(session: AsyncSession = Depends(get_db)):
    login_code, expiry_ts, state, dummy_id = await initiate_login(session)
    auth_url = f"https://accounts.spotify.com/authorize?client_id={settings.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri={settings.SPOTIFY_REDIRECT_URI}&scope=user-read-playback-state+user-modify-playback-state+user-read-currently-playing+streaming+app-remote-control&state={state}"
    return {"auth_url": auth_url, "expiry_timestamp": expiry_ts}


@router.get("/callback")
async def spotify_callback(code: str, state: str, session: AsyncSession = Depends(get_db)):
    login_code = await handle_spotify_callback(session, code, state)
    if not login_code:
        raise HTTPException(status_code=400, detail="Authentication failed")
    return {"message": "Authenticated", "code": login_code}


@router.get("/redeem_code")
async def redeem_code(code: str, session: AsyncSession = Depends(get_db)):
    result = await redeem_login_code(session, code)
    if not result:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    return result


@router.get("/eligible")
async def eligible(request: Request, session: AsyncSession = Depends(get_db)):
    auth = request.headers.get("authorization", "")
    ok = await check_eligible(session, auth)
    if not ok:
        raise HTTPException(status_code=401, detail="Timed out.")
    return {"eligible": True}


@router.post("/refresh")
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_db)):
    result = await refresh_access_token(session, body.access_token, body.refresh_token)
    if not result:
        raise HTTPException(status_code=401, detail="Refresh failed")
    return result
