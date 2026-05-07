from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.chats import router as chats_router
from app.api.messages import router as messages_router
from app.api.skills import router as skills_router
from app.core.settings import settings
from app.skills.loader import load_builtin_skills
from app.api.uploads import router as uploads_router


def create_app() -> FastAPI:
    app = FastAPI(title="My Law API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    load_builtin_skills()

    app.include_router(auth_router)
    app.include_router(chats_router)
    app.include_router(messages_router)
    app.include_router(skills_router)
    app.include_router(uploads_router)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    return app


app = create_app()

