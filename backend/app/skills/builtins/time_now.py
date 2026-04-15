from __future__ import annotations

from datetime import datetime, timezone

from app.skills.base import SkillContext


class TimeNowSkill:
    name = "time_now"
    description = "Returns current UTC time (ISO 8601)."

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        }

    async def run(self, ctx: SkillContext, args: dict) -> dict:
        return {"utc_iso": datetime.now(timezone.utc).isoformat()}

