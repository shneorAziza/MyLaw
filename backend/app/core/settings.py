from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
    )

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gpt_like"
    jwt_secret: str = "change-me"
    jwt_expires_min: int = 60
    cors_origins: str = "http://localhost:5173"

    llm_provider: str = "stub"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    llm_chat_model: str = ""
    llm_ocr_model: str = ""
    llm_embedding_model: str = "models/gemini-embedding-001"
    llm_thinking_level: str = "minimal"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com"
    openai_chat_model: str = "gpt-4o-mini"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
