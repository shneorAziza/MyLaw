from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserOut(BaseModel):
    id: str
    email: EmailStr
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthRegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthLoginIn(BaseModel):
    email: EmailStr
    password: str


class ChatOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ChatCreateOut(BaseModel):
    chat: ChatOut


class MessageOut(BaseModel):
    id: str
    chat_id: str
    role: str
    content: str
    metadata_json: dict
    created_at: datetime


class SendMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


class SendMessageOut(BaseModel):
    assistant_message: MessageOut
    message_ids: list[str]


class SkillSpecOut(BaseModel):
    name: str
    description: str
    input_schema: dict

