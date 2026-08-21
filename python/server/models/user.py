import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum as SAEnum
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    friend_code = Column(String(6), unique=True, nullable=False, index=True)
    display_name = Column(String(100))
    username = Column(String(100))
    access_token = Column(Text)
    refresh_token = Column(Text)
    token_expiry = Column(DateTime(3))
    spotify_access_token = Column(Text)
    spotify_refresh_token = Column(Text)
    spotify_token_expiry = Column(DateTime(3))
    spotify_state = Column(String(64))
    login_code = Column(String(6), index=True)
    login_code_expiry = Column(DateTime(3))
    last_online = Column(DateTime(3))
    privacy_mode = Column(SAEnum("friends", "none", "everyone"), default="friends")
    avatar_url = Column(Text)
    last_song_id = Column(String(100))
    last_progress = Column(Integer, default=0)
    last_is_playing = Column(Boolean, default=False)
    created_at = Column(DateTime(3), default=datetime.datetime.utcnow)
    updated_at = Column(DateTime(3), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
