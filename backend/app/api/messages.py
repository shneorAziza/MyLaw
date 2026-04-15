from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.api.schemas import MessageOut, SendMessageIn, SendMessageOut
from app.db.models import Chat, Message
from app.db.session import SessionLocal
from app.services.llm import get_llm_client
from app.skills.registry import registry  # tool registry (used by non-streaming endpoint)


router = APIRouter(prefix="/chats/{chat_id}/messages", tags=["messages"])


@router.get("", response_model=list[MessageOut])
def list_messages(chat_id: str, db: DbDep, current_user: CurrentUserDep) -> list[MessageOut]:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    msgs = db.scalars(select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at.asc())).all()
    return [MessageOut.model_validate(m, from_attributes=True) for m in msgs]


@router.post("", response_model=SendMessageOut)
async def send_message(chat_id: str, data: SendMessageIn, db: DbDep, current_user: CurrentUserDep) -> SendMessageOut:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    user_msg = Message(chat_id=chat_id, role="user", content=data.content, metadata_json={})
    db.add(user_msg)
    db.flush()

    history = db.scalars(select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at.asc())).all()

    # Non-streaming path uses the orchestrator (supports /tool execution)
    from app.services.orchestrator import ChatOrchestrator

    orchestrator = ChatOrchestrator(llm=get_llm_client(), skills=registry)
    assistant_msg, created_ids = await orchestrator.run_turn(db=db, user_id=current_user.id, chat_id=chat_id, history=history)

    if chat.title == "New chat":
        chat.title = (data.content.strip() or "Chat")[:60]
    chat.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_msg)

    return SendMessageOut(
        assistant_message=MessageOut.model_validate(assistant_msg, from_attributes=True),
        message_ids=[user_msg.id, *created_ids],
    )


@router.post(":stream")
async def send_message_stream(
    chat_id: str, data: SendMessageIn, db: DbDep, current_user: CurrentUserDep
) -> StreamingResponse:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    async def gen():
        # IMPORTANT: don't use the request-scoped `db` in a generator; it may close early.
        # Use a dedicated session for the stream.
        stream_db = SessionLocal()
        try:
            user_msg = Message(chat_id=chat_id, role="user", content=data.content, metadata_json={})
            stream_db.add(user_msg)
            stream_db.flush()

            history = stream_db.scalars(
                select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at.asc())
            ).all()

            llm = get_llm_client()
            tool_specs = registry.list_specs()
            llm_messages = [{"role": m.role, "content": m.content, "metadata": m.metadata_json, "id": m.id} for m in history]

            yield f"data: {json.dumps({'type': 'start', 'message_id': 'pending'})}\n\n"

            full_text = ""
            async for delta in llm.stream_text(messages=llm_messages, tools=tool_specs):
                if not delta:
                    continue
                full_text += delta
                yield f"data: {json.dumps({'type': 'delta', 'delta': delta})}\n\n"

            assistant_msg = Message(
                chat_id=chat_id,
                role="assistant",
                content=full_text,
                metadata_json={"stream": True, "provider": "gemini"},
            )
            stream_db.add(assistant_msg)

            chat2 = stream_db.get(Chat, chat_id)
            if chat2 and chat2.title == "New chat":
                chat2.title = (data.content.strip() or "Chat")[:60]
            if chat2:
                chat2.updated_at = datetime.now(timezone.utc)

            stream_db.commit()
            stream_db.refresh(assistant_msg)

            yield (
                "data: "
                + json.dumps(
                    {
                        "type": "done",
                        "assistant_message": MessageOut.model_validate(assistant_msg, from_attributes=True).model_dump(),
                        "message_ids": [user_msg.id, assistant_msg.id],
                    }
                )
                + "\n\n"
            )
        finally:
            stream_db.close()

    return StreamingResponse(gen(), media_type="text/event-stream")

