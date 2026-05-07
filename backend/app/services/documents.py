from __future__ import annotations

import asyncio
import base64
import inspect
import io
from uuid import uuid4

import fitz
import httpx
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.settings import settings
from app.db.models import Document, DocumentEmbedding


class DocumentProcessingError(Exception):
    pass


class DocumentService:
    def __init__(self, db_session: Session):
        self.db = db_session
        if not settings.llm_api_key:
            raise DocumentProcessingError("LLM_API_KEY is missing in backend/.env")

        self.embeddings_model = GoogleGenerativeAIEmbeddings(
            model=settings.llm_embedding_model,
            google_api_key=settings.llm_api_key,
        )

    async def process_upload(
        self,
        *,
        file_bytes: bytes,
        file_name: str,
        file_path: str,
        file_type: str,
        user_id: str,
        chat_id: str | None = None,
    ) -> dict:
        full_text = await self._extract_upload_text(file_bytes=file_bytes, file_type=file_type)
        chunks = self._split_text(full_text)
        vectors = await self._embed_documents(chunks)

        if len(vectors) != len(chunks):
            raise DocumentProcessingError(
                f"Embedding count mismatch: got {len(vectors)} vectors for {len(chunks)} chunks"
            )

        doc_id = str(uuid4())
        self.db.add(
            Document(
                id=doc_id,
                user_id=user_id,
                chat_id=chat_id,
                file_name=file_name,
                file_path=file_path,
                file_type=file_type,
            )
        )

        for chunk, vector in zip(chunks, vectors, strict=True):
            if not vector:
                raise DocumentProcessingError(f"Embedding failed for chunk: {chunk[:80]}")

            self.db.add(
                DocumentEmbedding(
                    document_id=doc_id,
                    content=chunk,
                    embedding=vector,
                )
            )

        self.db.commit()
        return {
            "document_id": doc_id,
            "file_name": file_name,
            "chunks_count": len(chunks),
        }

    async def process_pdf(
        self,
        *,
        file_bytes: bytes,
        file_name: str,
        file_path: str,
        user_id: str,
        chat_id: str | None = None,
    ) -> dict:
        return await self.process_upload(
            file_bytes=file_bytes,
            file_name=file_name,
            file_path=file_path,
            file_type="pdf",
            user_id=user_id,
            chat_id=chat_id,
        )

    async def search_similar(
        self,
        *,
        query: str,
        user_id: str,
        chat_id: str | None = None,
        limit: int = 5,
    ) -> list[dict]:
        query_vector = await self._embed_query(query)
        distance = DocumentEmbedding.embedding.cosine_distance(query_vector).label("distance")

        stmt = (
            select(DocumentEmbedding, Document, distance)
            .join(Document, Document.id == DocumentEmbedding.document_id)
            .where(Document.user_id == user_id)
            .order_by(distance)
            .limit(limit)
        )
        if chat_id:
            stmt = stmt.where(or_(Document.chat_id == chat_id, Document.chat_id.is_(None)))

        rows = self.db.execute(stmt).all()
        return [
            {
                "document_id": document.id,
                "file_name": document.file_name,
                "chunk_id": embedding.id,
                "content": embedding.content,
                "score": 1 - float(distance_value),
            }
            for embedding, document, distance_value in rows
        ]

    def has_indexed_documents(self, *, user_id: str, chat_id: str | None = None) -> bool:
        stmt = (
            select(DocumentEmbedding.id)
            .join(Document, Document.id == DocumentEmbedding.document_id)
            .where(Document.user_id == user_id)
            .limit(1)
        )
        if chat_id:
            stmt = stmt.where(or_(Document.chat_id == chat_id, Document.chat_id.is_(None)))
        return self.db.scalar(stmt) is not None

    def _extract_pdf_text(self, file_bytes: bytes) -> str:
        reader = PdfReader(io.BytesIO(file_bytes))
        text_parts = [text for page in reader.pages if (text := page.extract_text())]
        full_text = "\n".join(text_parts).strip()
        return full_text

    async def _extract_upload_text(self, *, file_bytes: bytes, file_type: str) -> str:
        if file_type == "pdf":
            full_text = self._extract_pdf_text(file_bytes)
            if full_text:
                return full_text
            return await self._ocr_pdf(file_bytes)

        if file_type.startswith("image/"):
            return await self._ocr_image(file_bytes, file_type)

        raise DocumentProcessingError("Only PDF and image files are supported")

    async def _ocr_pdf(self, file_bytes: bytes) -> str:
        pdf = fitz.open(stream=file_bytes, filetype="pdf")
        text_parts: list[str] = []
        for page_index, page in enumerate(pdf, start=1):
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            page_text = await self._ocr_image(pix.tobytes("png"), "image/png")
            if page_text:
                text_parts.append(f"[Page {page_index}]\n{page_text}")

        full_text = "\n\n".join(text_parts).strip()
        if not full_text:
            raise DocumentProcessingError("Could not extract or OCR text from PDF")
        return full_text

    async def _ocr_image(self, image_bytes: bytes, mime_type: str) -> str:
        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "Analyze this uploaded image for use in a legal assistant chat. "
                                "Extract every readable text string with original Hebrew/English, numbers, dates, and line breaks. "
                                "If there is little or no text, provide a concise factual visual description of legally relevant details, "
                                "such as document type, visible people/objects, damage, signatures, dates, addresses, amounts, UI text, or layout. "
                                "Do not invent details. Return plain text only."
                            )
                        },
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64.b64encode(image_bytes).decode("ascii"),
                            }
                        },
                    ],
                }
            ]
        }
        url = f"{settings.llm_base_url or 'https://generativelanguage.googleapis.com'}/v1beta/models/{settings.llm_model}:generateContent"
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(url, headers={"x-goog-api-key": settings.llm_api_key}, json=body)

        if res.status_code >= 400:
            raise DocumentProcessingError(f"OCR failed: {res.status_code} {res.text}")

        parts = (((res.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        text = "\n".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
        if not text:
            raise DocumentProcessingError("OCR did not find readable text")
        return text

    def _split_text(self, text: str) -> list[str]:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100,
            separators=["\n\n", "\n", ".", " "],
        )
        chunks = [chunk.strip() for chunk in text_splitter.split_text(text) if chunk.strip()]
        if not chunks:
            raise DocumentProcessingError("PDF text was extracted but no chunks were produced")
        return chunks

    async def _embed_documents(self, chunks: list[str]) -> list[list[float]]:
        if hasattr(self.embeddings_model, "aembed_documents"):
            result = self.embeddings_model.aembed_documents(chunks)
            if inspect.isawaitable(result):
                return await result
            return result
        return await asyncio.to_thread(self.embeddings_model.embed_documents, chunks)

    async def _embed_query(self, query: str) -> list[float]:
        if hasattr(self.embeddings_model, "aembed_query"):
            result = self.embeddings_model.aembed_query(query)
            if inspect.isawaitable(result):
                return await result
            return result
        return await asyncio.to_thread(self.embeddings_model.embed_query, query)
