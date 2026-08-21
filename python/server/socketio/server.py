import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import socketio
from ..database import async_session
from ..models.user import User
from ..models.friend import Friend
from ..models.listen_session import ListenSession
from ..services.friend_service import get_friends, get_friend_requests, get_outbound_requests
from ..services.listen_service import get_listeners
from ..utils import decode_token

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
)


class AuthorizationNamespace(socketio.AsyncNamespace):
    async def on_connect(self, sid, environ):
        auth = environ.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return False
        token = auth[7:]
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            return False
        user_id = int(payload["sub"])
        async with async_session() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                return False
            user.last_online = datetime.datetime.utcnow()
            await session.commit()
        await self.save_session(sid, {"user_id": user_id})
        await self.emit("Authorized", {"user_id": user_id}, to=sid)
        friends = await self._get_friends_data(user_id)
        await self.emit("friend_list", friends, to=sid)
        requests_data = await self._get_friend_requests_data(user_id)
        await self.emit("friend_requests", requests_data, to=sid)
        outbound = await self._get_outbound_requests_data(user_id)
        await self.emit("outbound_friend_requests", outbound, to=sid)
        return True

    async def on_disconnect(self, sid):
        session_data = await self.get_session(sid)
        if session_data and "user_id" in session_data:
            async with async_session() as db:
                result = await db.execute(select(User).where(User.id == session_data["user_id"]))
                user = result.scalar_one_or_none()
                if user:
                    user.last_online = datetime.datetime.utcnow()
                    await db.commit()

    async def on_send_current_state(self, sid, data):
        session_data = await self.get_session(sid)
        if not session_data:
            return
        user_id = session_data["user_id"]
        async with async_session() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                user.last_song_id = data.get("songid")
                user.last_progress = data.get("progress", 0)
                user.last_is_playing = data.get("is_playing", False)
                await db.commit()
            listeners = await get_listeners(db, user_id)
            for ls in listeners:
                await self.emit("listening_state", data, to=sid)

    async def on_start_listening(self, sid, data):
        session_data = await self.get_session(sid)
        if not session_data:
            return
        listener_id = session_data["user_id"]
        target_id = data
        async with async_session() as db:
            from ..services.listen_service import start_listening
            await start_listening(db, listener_id, target_id)
            await self.emit("start_listening_from_user", listener_id, to=target_id)

    async def on_end_listening(self, sid, data):
        session_data = await self.get_session(sid)
        if not session_data:
            return
        listener_id = session_data["user_id"]
        target_id = data
        async with async_session() as db:
            from ..services.listen_service import end_listening
            await end_listening(db, listener_id, target_id)
            await self.emit("end_listening_from_user", listener_id, to=target_id)

    async def _get_friends_data(self, user_id):
        async with async_session() as db:
            friends = await get_friends(db, user_id)
            result = []
            for f in friends:
                u = await db.execute(select(User).where(User.id == f.friend_id))
                user = u.scalar_one_or_none()
                if user:
                    result.append({
                        "id": user.id,
                        "friend_code": user.friend_code,
                        "display_name": user.display_name,
                        "username": user.username,
                        "avatar_url": user.avatar_url,
                        "last_online": user.last_online.timestamp() if user.last_online else None,
                        "last_song_id": user.last_song_id,
                    })
            return result

    async def _get_friend_requests_data(self, user_id):
        async with async_session() as db:
            requests = await get_friend_requests(db, user_id)
            result = []
            for r in requests:
                u = await db.execute(select(User).where(User.id == r.friend_id))
                user = u.scalar_one_or_none()
                if user:
                    result.append({
                        "id": r.id,
                        "user_id": user.id,
                        "display_name": user.display_name,
                        "username": user.username,
                        "avatar_url": user.avatar_url,
                    })
            return result

    async def _get_outbound_requests_data(self, user_id):
        async with async_session() as db:
            requests = await get_outbound_requests(db, user_id)
            result = []
            for r in requests:
                u = await db.execute(select(User).where(User.id == r.friend_id))
                user = u.scalar_one_or_none()
                if user:
                    result.append({
                        "id": r.id,
                        "user_id": user.id,
                        "display_name": user.display_name,
                        "username": user.username,
                        "avatar_url": user.avatar_url,
                    })
            return result


sio.register_namespace(AuthorizationNamespace("/api/authorization"))
