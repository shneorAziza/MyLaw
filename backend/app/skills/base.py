from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SkillContext:
    user_id: str
    chat_id: str


class Skill(Protocol):
    name: str
    description: str

    def input_schema(self) -> dict: ...

    async def run(self, ctx: SkillContext, args: dict) -> dict: ...

