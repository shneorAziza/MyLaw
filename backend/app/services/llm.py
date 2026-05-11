from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass

import httpx

from app.core.settings import settings
from app.services.gemini_errors import parse_gemini_error

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict


@dataclass(frozen=True)
class LLMResult:
    content: str
    tool_calls: list[ToolCall]
    metadata: dict


@dataclass(frozen=True)
class LLMStreamChunk:
    delta: str
    metadata: dict | None = None


class LLMClient:
    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:  # pragma: no cover
        raise NotImplementedError

    async def stream_text(self, *, messages: list[dict], tools: list[dict]):  # pragma: no cover
        """Async iterator yielding text deltas."""
        raise NotImplementedError


class LangChainGeminiClient(LLMClient):
    def __init__(self, api_key: str, model: str):
        self.llm = ChatGoogleGenerativeAI(
            google_api_key=api_key,
            model=model,
            temperature=0,
            convert_system_message_to_human=True 
        )

    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:
        lc_messages = []
        for m in messages:
            role = m["role"]
            content = m["content"]
            if role == "system": lc_messages.append(SystemMessage(content=content))
            elif role == "user": lc_messages.append(HumanMessage(content=content))
            elif role == "assistant": lc_messages.append(AIMessage(content=content))

        llm_with_tools = self.llm
        if tools:
            llm_with_tools = self.llm.bind_tools(tools)

        res = await llm_with_tools.ainvoke(lc_messages)
        
        tool_calls = [
            ToolCall(name=tc["name"], arguments=tc["args"]) 
            for tc in res.tool_calls
        ]

        return LLMResult(
            content=res.content,
            tool_calls=tool_calls,
            metadata={"provider": "langchain_gemini"}
        )

class StubLLMClient(LLMClient):
    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:
        last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        text = (last or {}).get("content", "")
        if text.startswith("/tool "):
            try:
                first_space = text.find(" ", len("/tool "))
                if first_space == -1:
                    return LLMResult(content="Usage: /tool <name> <json>", tool_calls=[], metadata={})
                name = text[len("/tool "): first_space].strip()
                args = json.loads(text[first_space + 1:].strip() or "{}")
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


class OpenAILLMClient(LLMClient):
    def __init__(self, *, api_key: str, model: str, base_url: str | None = None):
        self.api_key = api_key
        self.model = model
        self.base_url = (base_url or "https://api.openai.com").rstrip("/")

    def _endpoint(self) -> str:
        return f"{self.base_url}/v1/chat/completions"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def _to_openai_messages(self, messages: list[dict]) -> list[dict]:
        result = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content") or ""
            if role == "tool":
                result.append({"role": "user", "content": f"[TOOL RESULT]\n{content}"})
            elif role in {"system", "user", "assistant"}:
                result.append({"role": role, "content": content})
        return result

    def _to_openai_tools(self, tools: list[dict]) -> list[dict] | None:
        if not tools:
            return None
        return [
            {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema") or {"type": "object", "properties": {}},
                },
            }
            for tool in tools
        ]

    def _parse_error(self, *, status_code: int, body: str | bytes, operation: str) -> LLMResult:
        text = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = {}
        message = ((data.get("error") or {}).get("message") if isinstance(data, dict) else None) or text
        if status_code == 401:
            content = "מפתח ה-API של OpenAI חסר או לא תקין. בדוק את OPENAI_API_KEY בקובץ .env."
        elif status_code == 429:
            content = "הגענו זמנית למגבלת השימוש של OpenAI. אפשר לנסות שוב מאוחר יותר או לבדוק quota/billing."
        else:
            content = "הייתה שגיאה זמנית מול OpenAI. אפשר לנסות שוב בעוד רגע."
        return LLMResult(
            content=content,
            tool_calls=[],
            metadata={
                "error": True,
                "provider": "openai",
                "error_code": status_code,
                "error_message": message,
                "model": self.model,
                "operation": operation,
            },
        )

    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:
        if not self.api_key:
            return LLMResult(
                content="מפתח ה-API של OpenAI חסר. הוסף OPENAI_API_KEY בקובץ backend/.env.",
                tool_calls=[],
                metadata={"error": True, "provider": "openai", "error_code": "missing_api_key"},
            )

        body: dict = {
            "model": self.model,
            "messages": self._to_openai_messages(messages),
        }
        openai_tools = self._to_openai_tools(tools)
        if openai_tools:
            body["tools"] = openai_tools
            body["tool_choice"] = "auto"

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(self._endpoint(), headers=self._headers(), json=body)
        latency_ms = int((time.perf_counter() - start) * 1000)

        if res.status_code >= 400:
            result = self._parse_error(status_code=res.status_code, body=res.text, operation="chat")
            result.metadata["latency_ms"] = latency_ms
            return result

        data = res.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        tool_calls = []
        for tc in message.get("tool_calls") or []:
            fn = tc.get("function") or {}
            name = fn.get("name")
            if not name:
                continue
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(ToolCall(name=name, arguments=args))

        return LLMResult(
            content=message.get("content") or "",
            tool_calls=tool_calls,
            metadata={"provider": "openai", "model": self.model, "latency_ms": latency_ms},
        )

    async def stream_text(self, *, messages: list[dict], tools: list[dict]):
        if not self.api_key:
            yield LLMStreamChunk(
                delta="מפתח ה-API של OpenAI חסר. הוסף OPENAI_API_KEY בקובץ backend/.env.",
                metadata={"error": True, "provider": "openai", "error_code": "missing_api_key"},
            )
            return

        body: dict = {
            "model": self.model,
            "messages": self._to_openai_messages(messages),
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", self._endpoint(), headers=self._headers(), json=body) as res:
                if res.status_code >= 400:
                    result = self._parse_error(status_code=res.status_code, body=await res.aread(), operation="chat")
                    yield LLMStreamChunk(delta=result.content, metadata=result.metadata)
                    return

                async for line in res.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[len("data:"):].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        data = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    delta = (((data.get("choices") or [{}])[0].get("delta") or {}).get("content")) or ""
                    if delta:
                        yield delta


# ---------------------------------------------------------------------------
# Gemini client with full support for function calling
# ---------------------------------------------------------------------------

class GeminiLLMClient(LLMClient):
    def __init__(self, *, api_key: str, model: str, base_url: str | None = None, thinking_level: str = "minimal"):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url or "https://generativelanguage.googleapis.com"
        self.thinking_level = thinking_level

    def _endpoint(self) -> str:
        return f"{self.base_url}/v1beta/models/{self.model}:generateContent"

    def _stream_endpoint(self) -> str:
        return f"{self.base_url}/v1beta/models/{self.model}:streamGenerateContent"

    def _generation_config(self) -> dict:
        thinking_level = (self.thinking_level or "").strip().lower()
        if not thinking_level:
            return {}
        if self.model.startswith("gemini-3"):
            return {"thinkingConfig": {"thinkingLevel": thinking_level}}
        if thinking_level in {"minimal", "none", "off"}:
            return {"thinkingConfig": {"thinkingBudget": 0}}
        return {}

    # ------------------------------------------------------------------
    # Convert messages to Gemini format
    # ------------------------------------------------------------------

    def _to_gemini_contents(self, messages: list[dict]) -> list[dict]:
        """
        ממיר את רשימת ההודעות לפורמט contents של Gemini.
        תומך בתפקידים: system, user, assistant, tool.

        Gemini מצפה לרצף חוקי של תורות (turns):
          user → model → user → model …
        הודעות system נדחפות לתחילה כהודעת user.
        תוצאות tool נדחפות גם הן כ-user עם parts מסוג functionResponse.
        """
        contents: list[dict] = []

        for m in messages:
            role = m.get("role", "user")
            content = m.get("content") or ""
            metadata = m.get("metadata") or {}

            if role == "system":
                # הודעות system → user עם prefix
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"[SYSTEM INSTRUCTIONS]\n{content}"}],
                })

            elif role == "user":
                contents.append({
                    "role": "user",
                    "parts": [{"text": content}],
                })

            elif role == "assistant":
                contents.append({
                    "role": "model",
                    "parts": [{"text": content}],
                })

            elif role == "tool":
                # תוצאת tool חוזרת ל-Gemini כ-functionResponse
                skill_name = metadata.get("skill", "unknown_skill")
                try:
                    response_data = json.loads(content)
                except (json.JSONDecodeError, TypeError):
                    response_data = {"result": content}

                contents.append({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": skill_name,
                            "response": response_data,
                        }
                    }],
                })

        return contents

    # ------------------------------------------------------------------
    # המרת ה-tool specs שלנו לפורמט Gemini function declarations
    # ------------------------------------------------------------------

    def _to_gemini_tools(self, tools: list[dict]) -> list[dict] | None:
        """
        ממיר את ה-tool specs מהפורמט הפנימי שלנו לפורמט functionDeclarations של Gemini.

        הפורמט הפנימי שלנו (מ-registry.list_specs()):
          {
            "name": "israeli_employment_contracts",
            "description": "...",
            "input_schema": { "type": "object", "properties": {...}, "required": [...] }
          }

        הפורמט של Gemini:
          {
            "function_declarations": [
              {
                "name": "...",
                "description": "...",
                "parameters": { "type": "OBJECT", "properties": {...}, "required": [...] }
              }
            ]
          }
        """
        if not tools:
            return None

        declarations = []
        for t in tools:
            schema = t.get("input_schema") or {}
            # Gemini דורש type באותיות גדולות: "OBJECT" במקום "object"
            parameters = self._uppercase_types(schema)
            declarations.append({
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": parameters,
            })

        return [{"function_declarations": declarations}]

    def _uppercase_types(self, schema: dict) -> dict:
        """ממיר ערכי type ב-JSON Schema לאותיות גדולות (דרישת Gemini)."""
        if not isinstance(schema, dict):
            return schema

        result = {}
        for key, value in schema.items():
            if key == "type" and isinstance(value, str):
                result[key] = value.upper()
            elif isinstance(value, dict):
                result[key] = self._uppercase_types(value)
            elif isinstance(value, list):
                result[key] = [
                    self._uppercase_types(item) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                result[key] = value
        return result

    # ------------------------------------------------------------------
    # פרסור תשובת Gemini — טקסט + function calls
    # ------------------------------------------------------------------

    def _parse_response(self, data: dict) -> tuple[str, list[ToolCall]]:
        """
        מחלץ טקסט ו-function calls מתשובת Gemini.

        תשובת Gemini יכולה להכיל parts מסוגים שונים:
          - {"text": "..."} — טקסט רגיל
          - {"functionCall": {"name": "...", "args": {...}}} — קריאה לפונקציה
        """
        candidates = data.get("candidates") or []
        if not candidates:
            return "", []

        parts = (candidates[0].get("content") or {}).get("parts") or []

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []

        for part in parts:
            if not isinstance(part, dict):
                continue

            if "text" in part:
                text_parts.append(part["text"])

            elif "functionCall" in part:
                fc = part["functionCall"]
                name = fc.get("name", "")
                args = fc.get("args") or {}
                if name:
                    tool_calls.append(ToolCall(name=name, arguments=args))

        return "".join(text_parts), tool_calls

    # ------------------------------------------------------------------
    # generate — עם function calling
    # ------------------------------------------------------------------

    async def generate(self, *, messages: list[dict], tools: list[dict]) -> LLMResult:
        if not self.api_key:
            return LLMResult(
                content="LLM_API_KEY is missing in backend/.env",
                tool_calls=[],
                metadata={"gemini": True},
            )

        body: dict = {
            "contents": self._to_gemini_contents(messages),
        }
        generation_config = self._generation_config()
        if generation_config:
            body["generationConfig"] = generation_config

        # הוספת tools לבקשה רק אם יש סקילס רשומים
        gemini_tools = self._to_gemini_tools(tools)
        if gemini_tools:
            body["tools"] = gemini_tools
            # AUTO — Gemini מחליט לבד מתי לקרוא לפונקציה
            body["tool_config"] = {"function_calling_config": {"mode": "AUTO"}}

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                self._endpoint(),
                headers={"x-goog-api-key": self.api_key},
                json=body,
            )
        latency_ms = int((time.perf_counter() - start) * 1000)

        if res.status_code >= 400:
            error = parse_gemini_error(
                status_code=res.status_code,
                body=res.text,
                model=self.model,
                operation="chat",
            )
            logger.warning("gemini_generate_failed", extra=error.metadata())
            return LLMResult(
                content=error.user_message,
                tool_calls=[],
                metadata={**error.metadata(), "latency_ms": latency_ms},
            )

        text, tool_calls = self._parse_response(res.json())

        return LLMResult(
            content=text,
            tool_calls=tool_calls,
            metadata={"gemini": True, "latency_ms": latency_ms},
        )

    # ------------------------------------------------------------------
    # stream_text — עם tools (טקסט בלבד, tool calls מוחזרים בסוף)
    # ------------------------------------------------------------------

    async def stream_text(self, *, messages: list[dict], tools: list[dict]):
        """
        Streaming עם תמיכה ב-tools.

        הערה: Gemini לא תומך ב-streaming של function calls בצורה נוחה —
        במצב AUTO הוא ישלח function call רק בתגובה מלאה.
        לכן: אם יש tool call בתשובה, נחזיר את התוצאה המלאה (non-streaming),
        כדי שה-orchestrator יוכל לטפל בה נכון.
        """
        if not self.api_key:
            yield "LLM_API_KEY is missing in backend/.env"
            return

        body: dict = {
            "contents": self._to_gemini_contents(messages),
        }
        generation_config = self._generation_config()
        if generation_config:
            body["generationConfig"] = generation_config

        gemini_tools = self._to_gemini_tools(tools)
        if gemini_tools:
            body["tools"] = gemini_tools
            body["tool_config"] = {"function_calling_config": {"mode": "AUTO"}}

        last_text = ""
        start = time.perf_counter()

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                self._stream_endpoint(),
                params={"alt": "sse"},
                headers={
                    "accept": "text/event-stream",
                    "x-goog-api-key": self.api_key,
                },
                json=body,
            ) as res:
                if res.status_code >= 400:
                    error = parse_gemini_error(
                        status_code=res.status_code,
                        body=await res.aread(),
                        model=self.model,
                        operation="chat",
                    )
                    logger.warning("gemini_stream_failed", extra=error.metadata())
                    yield LLMStreamChunk(delta=error.user_message, metadata=error.metadata())
                    return

                async for line in res.aiter_lines():
                    if not line:
                        continue

                    payload = line
                    if payload.startswith("data:"):
                        payload = payload[len("data:"):].strip()
                    if payload == "[DONE]":
                        break

                    try:
                        data = json.loads(payload)
                    except json.JSONDecodeError:
                        continue

                    text, _ = self._parse_response(data)
                    if not text:
                        continue

                    # yield delta only
                    if text.startswith(last_text):
                        delta = text[len(last_text):]
                    else:
                        delta = text
                    last_text = text
                    if delta:
                        yield delta

        _ = int((time.perf_counter() - start) * 1000)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_llm_client(provider_override: str | None = None) -> LLMClient:
    provider = (provider_override or settings.llm_provider or "stub").lower().strip()
    if provider in {"openai", "gpt"}:
        return OpenAILLMClient(
            api_key=settings.openai_api_key,
            model=settings.openai_chat_model or "gpt-4o-mini",
            base_url=settings.openai_base_url or "https://api.openai.com",
        )
    if provider in {"gemini", "google"}:
        return GeminiLLMClient(
            api_key=settings.llm_api_key,
            model=settings.llm_chat_model or settings.llm_model or "gemini-2.0-flash",
            base_url=settings.llm_base_url or "https://generativelanguage.googleapis.com",
            thinking_level=settings.llm_thinking_level or "minimal",
        )
    return StubLLMClient()
