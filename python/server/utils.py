import secrets
import string
import datetime
from jose import jwt, JWTError

from .config import settings


def generate_friend_code():
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


def generate_login_code():
    return ''.join(secrets.choice(string.digits) for _ in range(6))


def create_access_token(user_id: int):
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": str(user_id), "exp": expire, "type": "access"}
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM), expire


def create_refresh_token(user_id: int):
    expire = datetime.datetime.utcnow() + datetime.timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": str(user_id), "exp": expire, "type": "refresh"}
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM), expire


def decode_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
