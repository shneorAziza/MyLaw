from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.api.projects import get_or_create_default_project
from app.api.schemas import ChatCreateIn, ChatCreateOut, ChatOut
from app.db.models import Chat, Project


router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("", response_model=list[ChatOut])
def list_chats(db: DbDep, current_user: CurrentUserDep, project_id: str | None = None) -> list[ChatOut]:
    stmt = select(Chat).where(Chat.user_id == current_user.id).order_by(Chat.updated_at.desc())
    if project_id:
        project = db.get(Project, project_id)
        if project is None or project.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        stmt = stmt.where(Chat.project_id == project_id)

    rows = db.scalars(stmt).all()
    return [ChatOut.model_validate(c, from_attributes=True) for c in rows]


@router.post("", response_model=ChatCreateOut)
def create_chat(
    db: DbDep,
    current_user: CurrentUserDep,
    data: ChatCreateIn | None = Body(default=None),
) -> ChatCreateOut:
    if data and data.project_id:
        project = db.get(Project, data.project_id)
        if project is None or project.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    else:
        project = get_or_create_default_project(db, current_user.id)

    chat = Chat(user_id=current_user.id, project_id=project.id, title=(data.title.strip() if data and data.title else "New chat"))
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return ChatCreateOut(chat=ChatOut.model_validate(chat, from_attributes=True))


@router.get("/{chat_id}", response_model=ChatOut)
def get_chat(chat_id: str, db: DbDep, current_user: CurrentUserDep) -> ChatOut:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return ChatOut.model_validate(chat, from_attributes=True)


@router.delete("/{chat_id}")
def delete_chat(chat_id: str, db: DbDep, current_user: CurrentUserDep) -> Response:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    db.delete(chat)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
