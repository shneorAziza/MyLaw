from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.api.deps import CurrentUserDep, DbDep
from app.db.models import Chat, Message, Project
from app.services.documents import DocumentProcessingError, DocumentService


router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "storage" / "documents"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class DocumentSearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    project_id: str | None = None
    chat_id: str | None = None
    limit: int = Field(default=5, ge=1, le=20)


class DocumentSearchHit(BaseModel):
    document_id: str
    file_name: str
    chunk_id: int
    content: str
    score: float


@router.post("/")
async def upload_document(
    db: DbDep,
    user: CurrentUserDep,
    file: UploadFile = File(...),
    project_id: str | None = None,
    chat_id: str | None = None,
) -> dict:
    file_type = file.content_type or ""
    if file_type != "application/pdf" and not file_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only PDF and image files are supported")

    file_id = str(uuid4())
    safe_name = Path(file.filename or "document.pdf").name
    file_path = UPLOAD_DIR / f"{file_id}_{safe_name}"

    try:
        if chat_id:
            chat = db.get(Chat, chat_id)
            if chat is None or chat.user_id != user.id:
                raise HTTPException(status_code=404, detail="Chat not found")
            project_id = chat.project_id
        elif project_id:
            project = db.get(Project, project_id)
            if project is None or project.user_id != user.id:
                raise HTTPException(status_code=404, detail="Project not found")
        else:
            raise HTTPException(status_code=400, detail="Upload must be attached to a chat or project")

        file_content = await file.read()
        file_path.write_bytes(file_content)

        doc_service = DocumentService(db)
        result = await doc_service.process_upload(
            file_bytes=file_content,
            file_name=safe_name,
            file_path=str(file_path),
            file_type="pdf" if file_type == "application/pdf" else file_type,
            user_id=user.id,
            project_id=project_id,
            chat_id=chat_id,
        )

        message_id = None
        if chat_id:
            attachment_kind = "PDF" if file_type == "application/pdf" else "image"
            message = Message(
                chat_id=chat_id,
                role="user",
                content=f"Attached {attachment_kind}: {safe_name}",
                metadata_json={
                    "attachment": {
                        "document_id": result["document_id"],
                        "file_name": safe_name,
                        "file_type": "pdf" if file_type == "application/pdf" else file_type,
                        "chunks_count": result["chunks_count"],
                    }
                },
            )
            db.add(message)
            db.flush()
            db.refresh(message)
            message_id = message.id

            assistant_message = Message(
                chat_id=chat_id,
                role="assistant",
                content=(
                    f"הקובץ {safe_name} הועלה ואונדקס בהצלחה. "
                    "אפשר לשאול אותי עליו עכשיו, ואשתמש בתוכן שלו בתשובות."
                ),
                metadata_json={
                    "upload_ack": True,
                    "document_id": result["document_id"],
                    "chunks_count": result["chunks_count"],
                },
            )
            db.add(assistant_message)
            db.commit()

        return {
            "id": result["document_id"],
            "filename": safe_name,
            "chunks_count": result["chunks_count"],
            "message_id": message_id,
            "status": "success_and_indexed",
        }
    except DocumentProcessingError as e:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except HTTPException:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}") from e


@router.post("/search", response_model=list[DocumentSearchHit])
async def search_documents(
    data: DocumentSearchIn,
    db: DbDep,
    user: CurrentUserDep,
) -> list[DocumentSearchHit]:
    try:
        project_id = data.project_id
        if data.chat_id:
            chat = db.get(Chat, data.chat_id)
            if chat is None or chat.user_id != user.id:
                raise HTTPException(status_code=404, detail="Chat not found")
            project_id = chat.project_id
        elif project_id:
            project = db.get(Project, project_id)
            if project is None or project.user_id != user.id:
                raise HTTPException(status_code=404, detail="Project not found")

        doc_service = DocumentService(db)
        hits = await doc_service.search_similar(
            query=data.query,
            user_id=user.id,
            project_id=project_id,
            chat_id=data.chat_id,
            limit=data.limit,
        )
        return [DocumentSearchHit(**hit) for hit in hits]
    except DocumentProcessingError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching documents: {str(e)}") from e
