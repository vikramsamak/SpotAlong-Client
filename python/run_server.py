import uvicorn
from server.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "server.app:socket_app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=True,
    )
