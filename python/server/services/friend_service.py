from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from ..models.friend import Friend


async def send_friend_request(session: AsyncSession, user_id: int, friend_code: str):
    result = await session.execute(select(User).where(User.friend_code == friend_code))
    friend = result.scalar_one_or_none()
    if not friend or friend.id == user_id:
        return None
    existing = await session.execute(
        select(Friend).where(
            or_(
                and_(Friend.user_id == user_id, Friend.friend_id == friend.id),
                and_(Friend.user_id == friend.id, Friend.friend_id == user_id),
            )
        )
    )
    if existing.scalar_one_or_none():
        return None
    f1 = Friend(user_id=user_id, friend_id=friend.id, status="pending", direction="sent")
    f2 = Friend(user_id=friend.id, friend_id=user_id, status="pending", direction="received")
    session.add_all([f1, f2])
    await session.commit()
    return friend.id


async def respond_friend_request(session: AsyncSession, user_id: int, requester_id: int, accept: bool):
    result = await session.execute(
        select(Friend).where(
            Friend.user_id == user_id, Friend.friend_id == requester_id, Friend.status == "pending"
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return False
    entry.status = "accepted" if accept else "declined"
    other = await session.execute(
        select(Friend).where(
            Friend.user_id == requester_id, Friend.friend_id == user_id, Friend.status == "pending"
        )
    )
    other_entry = other.scalar_one_or_none()
    if other_entry:
        other_entry.status = entry.status
    await session.commit()
    return True


async def remove_friend(session: AsyncSession, user_id: int, friend_id: int):
    for col in [(user_id, friend_id), (friend_id, user_id)]:
        result = await session.execute(
            select(Friend).where(Friend.user_id == col[0], Friend.friend_id == col[1])
        )
        entry = result.scalar_one_or_none()
        if entry:
            await session.delete(entry)
    await session.commit()


async def get_friends(session: AsyncSession, user_id: int):
    result = await session.execute(
        select(Friend).where(Friend.user_id == user_id, Friend.status == "accepted")
    )
    return result.scalars().all()


async def get_friend_requests(session: AsyncSession, user_id: int):
    result = await session.execute(
        select(Friend).where(Friend.user_id == user_id, Friend.status == "pending", Friend.direction == "received")
    )
    return result.scalars().all()


async def get_outbound_requests(session: AsyncSession, user_id: int):
    result = await session.execute(
        select(Friend).where(Friend.user_id == user_id, Friend.status == "pending", Friend.direction == "sent")
    )
    return result.scalars().all()
