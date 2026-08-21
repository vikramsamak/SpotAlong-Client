from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.listen_session import ListenSession


async def start_listening(session: AsyncSession, listener_id: int, target_id: int):
    existing = await session.execute(
        select(ListenSession).where(
            ListenSession.listener_id == listener_id, ListenSession.target_id == target_id
        )
    )
    entry = existing.scalar_one_or_none()
    if entry:
        entry.active = True
    else:
        entry = ListenSession(listener_id=listener_id, target_id=target_id, active=True)
        session.add(entry)
    await session.commit()
    return entry


async def end_listening(session: AsyncSession, listener_id: int, target_id: int):
    result = await session.execute(
        select(ListenSession).where(
            ListenSession.listener_id == listener_id, ListenSession.target_id == target_id
        )
    )
    entry = result.scalar_one_or_none()
    if entry:
        entry.active = False
        await session.commit()


async def get_listeners(session: AsyncSession, target_id: int):
    result = await session.execute(
        select(ListenSession).where(
            ListenSession.target_id == target_id, ListenSession.active == True
        )
    )
    return result.scalars().all()
