import logging
import sys
from pathlib import Path

_parent = Path(__file__).resolve().parent.parent
if str(_parent) not in sys.path:
    sys.path.insert(0, str(_parent))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import socketio

from server.config import settings
from server.database import init_db
from server.routes import auth, friends, cache, me
from server.socketio.server import sio

logging.basicConfig(level=logging.INFO, format="%(levelname)s:  %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="SpotAlong Server", version="1.0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(friends.router)
app.include_router(cache.router)
app.include_router(me.router)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

public_url = None


@app.on_event("startup")
async def startup():
    await init_db()
    if settings.NGROK_ENABLED:
        start_ngrok()


@app.get("/api/ngrok-url")
def get_ngrok_url():
    return JSONResponse(
        {"url": public_url}
        if public_url
        else {"url": None, "message": "Ngrok not started"}
    )


def start_ngrok():
    global public_url
    try:
        from pyngrok import ngrok, conf

        if settings.NGROK_AUTH_TOKEN:
            conf.get_default().auth_token = settings.NGROK_AUTH_TOKEN

        kwargs = {"addr": str(settings.SERVER_PORT)}
        if settings.NGROK_DOMAIN:
            kwargs["domain"] = settings.NGROK_DOMAIN

        tunnel = ngrok.connect(**kwargs)
        public_url = tunnel.public_url
        logger.info(f"Ngrok tunnel opened at {public_url}")
    except Exception as e:
        logger.warning(f"Failed to start ngrok tunnel: {e}")
        logger.warning("Set NGROK_AUTH_TOKEN in .env to use ngrok")


if __name__ == "__main__":
    uvicorn.run(
        "server.app:socket_app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=True,
    )
