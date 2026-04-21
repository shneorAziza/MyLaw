from __future__ import annotations
from datetime import datetime, timezone
from app.skills.base import SkillContext


class TimeNowSkill:
    name = "time_now"
    description = "Returns the current UTC date and time."

    def input_schema(self) -> dict:
        return {"type": "object", "properties": {}, "required": []}

    async def run(self, ctx: SkillContext, args: dict) -> dict:
        return {"utc": datetime.now(timezone.utc).isoformat()}
