from pathlib import Path

from pydantic_settings import BaseSettings

_parent = Path(__file__).resolve().parent


class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+asyncmy://root@localhost:3306/spotalong"
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SPOTIFY_CLIENT_ID: str = ""
    SPOTIFY_CLIENT_SECRET: str = ""
    SPOTIFY_REDIRECT_URI: str = "http://localhost:8000/api/login/callback"
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8000
    NGROK_ENABLED: bool = True
    NGROK_AUTH_TOKEN: str = ""
    NGROK_DOMAIN: str = ""

    class Config:
        env_file = str(_parent / ".env")


settings = Settings()
