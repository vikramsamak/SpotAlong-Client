import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from ..database import Base


class CacheEntry(Base):
    __tablename__ = "cache_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(String(255), unique=True, nullable=False)
    value = Column(Text)
    created_at = Column(DateTime(3), default=datetime.datetime.utcnow)
    expires_at = Column(DateTime(3))

    __table_args__ = (
        Index("idx_cache_key", "cache_key"),
        Index("idx_expires", "expires_at"),
    )
