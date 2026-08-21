import datetime
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from ..utils import generate_friend_code, generate_login_code, create_access_token, create_refresh_token, decode_token
from .spotify_oauth import exchange_code, get_spotify_user_info


async def initiate_login(session: AsyncSession):
    login_code = generate_login_code()
    state = generate_login_code()
    expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
    dummy = User(
        friend_code=generate_friend_code(),
        spotify_state=state,
        login_code=login_code,
        login_code_expiry=expiry,
    )
    session.add(dummy)
    await session.commit()
    return login_code, expiry.timestamp(), state, dummy.id


async def handle_spotify_callback(session: AsyncSession, code: str, state: str):
    result = await session.execute(select(User).where(User.spotify_state == state))
    user = result.scalar_one_or_none()
    if not user:
        return None
    tokens = await exchange_code(code)
    if not tokens:
        return None
    spotify_info = await get_spotify_user_info(tokens["access_token"])
    if not spotify_info:
        return None
    user.spotify_access_token = tokens["access_token"]
    user.spotify_refresh_token = tokens.get("refresh_token", user.spotify_refresh_token)
    user.spotify_token_expiry = datetime.datetime.utcnow() + datetime.timedelta(seconds=tokens.get("expires_in", 3600))
    user.display_name = spotify_info.get("display_name")
    user.username = spotify_info.get("id")
    user.avatar_url = spotify_info["images"][0]["url"] if spotify_info.get("images") else None
    await session.commit()
    return user.login_code


async def redeem_login_code(session: AsyncSession, code: str):
    result = await session.execute(select(User).where(User.login_code == code))
    user = result.scalar_one_or_none()
    if not user or not user.login_code_expiry or user.login_code_expiry < datetime.datetime.utcnow():
        return None
    if not user.spotify_access_token:
        return None
    access_token, access_exp = create_access_token(user.id)
    refresh_token, _ = create_refresh_token(user.id)
    user.access_token = access_token
    user.refresh_token = refresh_token
    user.token_expiry = access_exp
    user.login_code = None
    user.login_code_expiry = None
    await session.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "timeout": access_exp.timestamp(),
    }


async def refresh_access_token(session: AsyncSession, old_access_token: str, old_refresh_token: str):
    payload = decode_token(old_refresh_token)
    if not payload or payload.get("type") != "refresh":
        return None
    user_id = int(payload["sub"])
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.refresh_token != old_refresh_token:
        return None
    access_token, access_exp = create_access_token(user.id)
    refresh_token, refresh_exp = create_refresh_token(user.id)
    user.access_token = access_token
    user.refresh_token = refresh_token
    user.token_expiry = access_exp
    await session.commit()
    return {
        "token": access_token,
        "refresh_token": refresh_token,
        "timeout": access_exp.timestamp(),
    }


async def check_eligible(session: AsyncSession, token: str):
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return False
    user_id = int(payload["sub"])
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return False
    return user.token_expiry > datetime.datetime.utcnow() if user.token_expiry else False
