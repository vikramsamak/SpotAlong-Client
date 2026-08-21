from pydantic import BaseModel


class LoginResponse(BaseModel):
    auth_url: str
    expiry_timestamp: float


class RedeemRequest(BaseModel):
    code: str


class RedeemResponse(BaseModel):
    access_token: str
    refresh_token: str
    timeout: float


class RefreshRequest(BaseModel):
    access_token: str
    refresh_token: str


class RefreshResponse(BaseModel):
    token: str
    refresh_token: str
    timeout: float


class TokenData(BaseModel):
    user_id: int
