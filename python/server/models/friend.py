import datetime
from sqlalchemy import Column, Integer, Enum as SAEnum, DateTime, ForeignKey, UniqueConstraint
from ..database import Base


class Friend(Base):
    __tablename__ = "friends"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    friend_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(SAEnum("pending", "accepted", "declined"), default="pending")
    direction = Column(SAEnum("sent", "received"), nullable=False)
    created_at = Column(DateTime(3), default=datetime.datetime.utcnow)
    updated_at = Column(DateTime(3), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "friend_id", name="uk_friendship"),
    )
