from __future__ import annotations

from app.skills.base import Skill


class SkillRegistry:
    def __init__(self) -> None:
        self._skills: dict[str, Skill] = {}

    def register(self, skill: Skill) -> None:
        self._skills[skill.name] = skill

    def get(self, name: str) -> Skill | None:
        return self._skills.get(name)

    def list_specs(self) -> list[dict]:
        return [
            {"name": s.name, "description": s.description, "input_schema": s.input_schema()}
            for s in self._skills.values()
        ]


registry = SkillRegistry()

