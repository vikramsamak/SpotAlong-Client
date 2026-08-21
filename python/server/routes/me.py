from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.user import User
from ..utils import decode_token

router = APIRouter(prefix="/api/me")


@router.post("/status_broadcast")
async def toggle_status_broadcast(request: Request, session: AsyncSession = Depends(get_db)):
    auth = request.headers.get("authorization", "")
    payload = decode_token(auth)
    if not payload:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = int(payload["sub"])
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    body = await request.json()
    user.privacy_mode = body.get("privacy_mode", user.privacy_mode)
    await session.commit()
    return {"success": True}
