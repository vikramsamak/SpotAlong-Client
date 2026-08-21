from pydantic import BaseModel
from typing import Optional


class UserResponse(BaseModel):
    id: int
    friend_code: str
    display_name: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    last_online: Optional[float] = None
    last_song_id: Optional[str] = None
    last_progress: Optional[int] = None
    last_is_playing: Optional[bool] = None
    privacy_mode: str = "friends"


class FriendResponse(BaseModel):
    id: int
    friend_code: str
    display_name: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    status: str
    direction: str
