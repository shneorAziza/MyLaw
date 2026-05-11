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
from app.services.documents import DocumentService
from app.services.llm import LLMStreamChunk, get_llm_client
from app.skills.registry import registry  # tool registry (used by non-streaming endpoint)


router = APIRouter(prefix="/chats/{chat_id}/messages", tags=["messages"])


async def build_document_context(
    *,
    db,
    user_id: str,
    chat_id: str,
    project_id: str,
    question: str,
) -> str | None:
    try:
        document_service = DocumentService(db)
        if not document_service.has_indexed_documents(user_id=user_id, project_id=project_id, chat_id=chat_id):
            return None

        hits = await document_service.search_similar(
            query=question,
            user_id=user_id,
            project_id=project_id,
            chat_id=chat_id,
            limit=5,
        )
    except Exception:
        return None

    if not hits:
        return None

    context_blocks = [
        f"[{idx}] {hit['file_name']} (score: {hit['score']:.3f})\n{hit['content']}"
        for idx, hit in enumerate(hits, start=1)
    ]
    return (
        "Relevant document excerpts for this user question are below. "
        "Use them when helpful, but do not invent facts that are not supported by them.\n\n"
        + "\n\n---\n\n".join(context_blocks)
    )


def looks_incomplete_stream_response(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if len(stripped) >= 240:
        return False
    if stripped[-1] in ".!?。！？:;…*_)\"'”’":
        return False
    return True


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
    document_context = await build_document_context(
        db=db,
        user_id=current_user.id,
        chat_id=chat_id,
        project_id=chat.project_id,
        question=data.content,
    )
    if document_context:
        history = [
            Message(chat_id=chat_id, role="system", content=document_context, metadata_json={"rag": True}),
            *history,
        ]

    # Non-streaming path uses the orchestrator (supports /tool execution)
    from app.services.orchestrator import ChatOrchestrator

    orchestrator = ChatOrchestrator(llm=get_llm_client(data.model_provider), skills=registry)
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
            document_context = await build_document_context(
                db=stream_db,
                user_id=current_user.id,
                chat_id=chat_id,
                project_id=chat.project_id,
                question=data.content,
            )
            if document_context:
                history = [
                    Message(chat_id=chat_id, role="system", content=document_context, metadata_json={"rag": True}),
                    *history,
                ]

            llm = get_llm_client(data.model_provider)
            tool_specs = registry.list_specs()
            llm_messages = [{"role": m.role, "content": m.content, "metadata": m.metadata_json, "id": m.id} for m in history]

            yield f"data: {json.dumps({'type': 'start', 'message_id': 'pending'})}\n\n"

            full_text = ""
            assistant_metadata = {"stream": True, "provider": "gemini"}
            try:
                # Gemini can stream a function call with no text in AUTO tool mode.
                # For the typing UI, prefer a text-only stream and fall back to a full
                # non-streaming answer if the stream still ends empty.
                async for streamed in llm.stream_text(messages=llm_messages, tools=[]):
                    if isinstance(streamed, LLMStreamChunk):
                        delta = streamed.delta
                        if streamed.metadata:
                            assistant_metadata.update(streamed.metadata)
                    else:
                        delta = streamed
                    if not delta:
                        continue
                    full_text += delta
                    yield f"data: {json.dumps({'type': 'delta', 'delta': delta})}\n\n"

                if not full_text.strip():
                    fallback = await llm.generate(messages=llm_messages, tools=[])
                    full_text = fallback.content.strip()
                    assistant_metadata.update(fallback.metadata or {})
                    if full_text:
                        yield f"data: {json.dumps({'type': 'delta', 'delta': full_text})}\n\n"
                elif not assistant_metadata.get("error") and looks_incomplete_stream_response(full_text):
                    fallback = await llm.generate(messages=llm_messages, tools=[])
                    fallback_text = fallback.content.strip()
                    if len(fallback_text) > len(full_text):
                        full_text = fallback_text
                        assistant_metadata.update(fallback.metadata or {})
                        yield f"data: {json.dumps({'type': 'replace', 'content': full_text})}\n\n"
            except Exception as e:  # noqa: BLE001
                full_text = f"שגיאה ביצירת תשובה: {e}"
                assistant_metadata.update({"error": True, "error_code": "exception"})
                yield f"data: {json.dumps({'type': 'delta', 'delta': full_text})}\n\n"

            if not full_text.strip():
                full_text = "לא הצלחתי לייצר תשובה כרגע. נסה לשלוח שוב או לנסח מחדש את השאלה."
                yield f"data: {json.dumps({'type': 'delta', 'delta': full_text})}\n\n"

            assistant_msg = Message(
                chat_id=chat_id,
                role="assistant",
                content=full_text,
                metadata_json={**assistant_metadata, "selected_provider": data.model_provider or None},
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
                        "assistant_message": MessageOut.model_validate(
                            assistant_msg, from_attributes=True
                        ).model_dump(mode="json"),
                        "message_ids": [user_msg.id, assistant_msg.id],
                    }
                )
                + "\n\n"
            )
        finally:
            stream_db.close()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
