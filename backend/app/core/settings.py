from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gpt_like"
    jwt_secret: str = "change-me"
    jwt_expires_min: int = 60
    cors_origins: str = "http://localhost:5173"

    llm_provider: str = "stub"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    llm_embedding_model: str = "models/gemini-embedding-001"
    llm_thinking_level: str = "minimal"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
