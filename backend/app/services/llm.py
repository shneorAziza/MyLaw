from __future__ import annotations

import json
import time
from dataclasses import dataclass

import httpx

from app.core.settings import settings


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict


@dataclass(frozen=True)
class LLMResult:
    content: str
    tool_calls: list[ToolCall]
    metadata: dict


class LLMClient:
    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:  # pragma: no cover
        raise NotImplementedError

    async def stream_text(self, *, messages: list[dict], tools: list[dict]):  # pragma: no cover
        """
        Async iterator yielding text deltas.
        """
        raise NotImplementedError


class StubLLMClient(LLMClient):
    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:
        # Simple deterministic behavior:
        # - If the latest user message starts with "/tool <name> {json}", request that tool.
        # - Otherwise return a placeholder assistant response.
        last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        text = (last or {}).get("content", "")
        if text.startswith("/tool "):
            # format: /tool skillName {"a":1}
            try:
                first_space = text.find(" ", len("/tool "))
                if first_space == -1:
                    return LLMResult(content="Usage: /tool <name> <json>", tool_calls=[], metadata={})
                name = text[len("/tool ") : first_space].strip()
                import json

                args = json.loads(text[first_space + 1 :].strip() or "{}")
                return LLMResult(content="", tool_calls=[ToolCall(name=name, arguments=args)], metadata={"stub": True})
            except Exception as e:  # noqa: BLE001
                return LLMResult(content=f"Tool parse error: {e}", tool_calls=[], metadata={"stub": True})

        return LLMResult(
            content="(stub) Connected. You can call a tool using: /tool time_now {}",
            tool_calls=[],
            metadata={"stub": True},
        )

    async def stream_text(self, *, messages: list[dict], tools: list[dict]):
        res = await self.generate(messages=messages, tools=tools)
        yield res.content


class GeminiLLMClient(LLMClient):
    def __init__(self, *, api_key: str, model: str, base_url: str | None = None, thinking_level: str = "minimal"):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url or "https://generativelanguage.googleapis.com"
        self.thinking_level = thinking_level

    def _endpoint(self) -> str:
        # v1beta/models/${model}:generateContent
        return f"{self.base_url}/v1beta/models/{self.model}:generateContent"

    def _stream_endpoint(self) -> str:
        # v1beta/models/${model}:streamGenerateContent
        return f"{self.base_url}/v1beta/models/{self.model}:streamGenerateContent"

    def _to_gemini_contents(self, messages: list[dict]) -> list[dict]:
        contents: list[dict] = []
        for m in messages:
            role = m.get("role")
            text = m.get("content") or ""
            if role == "assistant":
                gem_role = "model"
            else:
                # system/user/tool -> user (we inline system/tool content)
                gem_role = "user"
                if role == "system":
                    text = f"SYSTEM:\n{text}"
                elif role == "tool":
                    text = f"TOOL_RESULT:\n{text}"

            if not text:
                continue
            contents.append({"role": gem_role, "parts": [{"text": text}]})
        return contents

    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:
        if not self.api_key:
            return LLMResult(content="LLM_API_KEY is missing in backend/.env", tool_calls=[], metadata={"gemini": True})

        body = {
            "contents": self._to_gemini_contents(messages),
            "generationConfig": {"thinkingConfig": {"thinkingLevel": self.thinking_level}},
        }

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                self._endpoint(),
                headers={"x-goog-api-key": self.api_key},
                json=body,
            )
        latency_ms = int((time.perf_counter() - start) * 1000)

        if res.status_code >= 400:
            return LLMResult(
                content=f"Gemini error {res.status_code}: {res.text}",
                tool_calls=[],
                metadata={"gemini": True, "latency_ms": latency_ms},
            )

        data = res.json()
        parts = (((data.get("candidates") or [{}])[0]).get("content") or {}).get("parts") or []
        text = "".join([p.get("text", "") for p in parts if isinstance(p, dict)])

        return LLMResult(content=text, tool_calls=[], metadata={"gemini": True, "latency_ms": latency_ms})

    async def stream_text(self, *, messages: list[dict], tools: list[dict]):
        """
        True streaming using Gemini `streamGenerateContent`.

        The API responds as a stream of JSON objects (often via SSE). We parse each event,
        reconstruct the current candidate text, and yield only the delta.
        """
        if not self.api_key:
            yield "LLM_API_KEY is missing in backend/.env"
            return

        body = {
            "contents": self._to_gemini_contents(messages),
            "generationConfig": {"thinkingConfig": {"thinkingLevel": self.thinking_level}},
        }

        last_text = ""
        start = time.perf_counter()

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                self._stream_endpoint(),
                headers={"x-goog-api-key": self.api_key},
                json=body,
            ) as res:
                if res.status_code >= 400:
                    yield f"Gemini error {res.status_code}: {await res.aread()}"
                    return

                async for line in res.aiter_lines():
                    if not line:
                        continue

                    payload = line
                    if payload.startswith("data:"):
                        payload = payload[len("data:") :].strip()
                    if payload == "[DONE]":
                        break

                    try:
                        data = json.loads(payload)
                    except json.JSONDecodeError:
                        # some implementations send non-json keepalive lines
                        continue

                    parts = (((data.get("candidates") or [{}])[0]).get("content") or {}).get("parts") or []
                    text = "".join([p.get("text", "") for p in parts if isinstance(p, dict)])
                    if not text:
                        continue

                    # yield delta only
                    if text.startswith(last_text):
                        delta = text[len(last_text) :]
                    else:
                        delta = text
                    last_text = text
                    if delta:
                        yield delta

        _ = int((time.perf_counter() - start) * 1000)


def get_llm_client() -> LLMClient:
    provider = (settings.llm_provider or "stub").lower().strip()
    if provider in {"gemini", "google"}:
        return GeminiLLMClient(
            api_key=settings.llm_api_key,
            model=settings.llm_model or "gemini-3-flash-preview",
            base_url=settings.llm_base_url or "https://generativelanguage.googleapis.com",
            thinking_level=settings.llm_thinking_level or "minimal",
        )
    return StubLLMClient()
