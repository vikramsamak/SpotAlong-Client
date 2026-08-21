from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.user import User
from ..models.friend import Friend
from ..schemas.friend import FriendRequest
from ..services.friend_service import (
    send_friend_request,
    respond_friend_request,
    remove_friend,
)
from ..utils import decode_token

router = APIRouter(prefix="/api/friends")


async def get_user_id(request: Request):
    auth = request.headers.get("authorization", "")
    payload = decode_token(auth)
    if not payload:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return int(payload["sub"])


@router.post("/friend_request")
async def friend_request(body: FriendRequest, request: Request, session: AsyncSession = Depends(get_db)):
    user_id = await get_user_id(request)
    friend_id = await send_friend_request(session, user_id, body.friend_code)
    if not friend_id:
        raise HTTPException(status_code=400, detail="Could not send request")
    return {"friend_id": friend_id}


@router.post("/remove_friend")
async def remove_friend_endpoint(body: FriendRequest, request: Request, session: AsyncSession = Depends(get_db)):
    user_id = await get_user_id(request)
    result = await session.execute(select(User).where(User.friend_code == body.friend_code))
    friend = result.scalar_one_or_none()
    if not friend:
        raise HTTPException(status_code=404, detail="User not found")
    await remove_friend(session, user_id, friend.id)
    return {"success": True}


@router.post("/accept")
async def accept_request(requester_id: int, request: Request, session: AsyncSession = Depends(get_db)):
    user_id = await get_user_id(request)
    ok = await respond_friend_request(session, user_id, requester_id, accept=True)
    if not ok:
        raise HTTPException(status_code=400, detail="Could not accept")
    return {"success": True}


@router.post("/decline")
async def decline_request(requester_id: int, request: Request, session: AsyncSession = Depends(get_db)):
    user_id = await get_user_id(request)
    ok = await respond_friend_request(session, user_id, requester_id, accept=False)
    if not ok:
        raise HTTPException(status_code=400, detail="Could not decline")
    return {"success": True}
