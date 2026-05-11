from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class GeminiErrorInfo:
    code: int
    status: str
    message: str
    user_message: str
    model: str
    operation: str
    quota_metric: str | None = None
    quota_value: str | None = None
    retry_delay: str | None = None

    def metadata(self) -> dict[str, Any]:
        return {
            "error": True,
            "provider": "gemini",
            "error_code": self.code,
            "error_status": self.status,
            "model": self.model,
            "operation": self.operation,
            "quota_metric": self.quota_metric,
            "quota_value": self.quota_value,
            "retry_delay": self.retry_delay,
        }


def parse_gemini_error(
    *,
    status_code: int,
    body: str | bytes,
    model: str,
    operation: str,
) -> GeminiErrorInfo:
    text = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body
    data = _load_error_json(text)
    error = data.get("error") if isinstance(data.get("error"), dict) else {}
    details = error.get("details") if isinstance(error.get("details"), list) else []

    message = str(error.get("message") or text or f"Gemini error {status_code}")
    retry_delay = _extract_retry_delay(details) or _extract_retry_delay_from_text(message)
    quota_metric, quota_value = _extract_quota(details)
    code = int(error.get("code") or status_code)
    status = str(error.get("status") or _status_from_code(code))

    return GeminiErrorInfo(
        code=code,
        status=status,
        message=message,
        user_message=_build_user_message(code=code, status=status, retry_delay=retry_delay),
        model=model,
        operation=operation,
        quota_metric=quota_metric,
        quota_value=quota_value,
        retry_delay=retry_delay,
    )


def _load_error_json(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _extract_retry_delay(details: list[Any]) -> str | None:
    for detail in details:
        if isinstance(detail, dict) and detail.get("@type", "").endswith("RetryInfo"):
            delay = detail.get("retryDelay")
            if delay:
                return str(delay)
    return None


def _extract_retry_delay_from_text(message: str) -> str | None:
    match = re.search(r"retry in ([0-9.]+)s", message, flags=re.IGNORECASE)
    if not match:
        return None
    seconds = float(match.group(1))
    return f"{int(round(seconds))}s"


def _extract_quota(details: list[Any]) -> tuple[str | None, str | None]:
    for detail in details:
        if not isinstance(detail, dict) or not detail.get("@type", "").endswith("QuotaFailure"):
            continue
        violations = detail.get("violations") if isinstance(detail.get("violations"), list) else []
        for violation in violations:
            if isinstance(violation, dict):
                return violation.get("quotaMetric"), violation.get("quotaValue")
    return None, None


def _status_from_code(code: int) -> str:
    if code == 429:
        return "RESOURCE_EXHAUSTED"
    if code in {503, 504}:
        return "UNAVAILABLE"
    return "ERROR"


def _build_user_message(*, code: int, status: str, retry_delay: str | None) -> str:
    if code == 429 or status == "RESOURCE_EXHAUSTED":
        if retry_delay:
            return (
                "הגענו זמנית למגבלת השימוש במודל. "
                f"אפשר לנסות שוב בעוד כ-{retry_delay}, או להמשיך אחרי הגדלת quota/billing."
            )
        return "הגענו זמנית למגבלת השימוש במודל. אפשר לנסות שוב מאוחר יותר או להגדיל quota/billing."

    if code in {503, 504} or status == "UNAVAILABLE":
        return "שירות ה-AI עמוס כרגע. אפשר לנסות שוב בעוד רגע."

    return "הייתה שגיאה זמנית מול שירות ה-AI. אפשר לנסות שוב בעוד רגע."
