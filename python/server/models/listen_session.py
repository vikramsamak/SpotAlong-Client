import datetime
from sqlalchemy import Column, Integer, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from ..database import Base


class ListenSession(Base):
    __tablename__ = "listen_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    listener_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    state = Column(Text)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(3), default=datetime.datetime.utcnow)
    updated_at = Column(DateTime(3), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("listener_id", "target_id", name="uk_session"),
    )
