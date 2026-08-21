from pydantic import BaseModel


class FriendRequest(BaseModel):
    friend_code: str


class FriendAction(BaseModel):
    requester_id: int
