from __future__ import annotations

from app.skills.builtins.simple_calculator import SimpleCalculatorSkill
from app.skills.builtins.time_now import TimeNowSkill
from app.skills.registry import registry


def load_builtin_skills() -> None:
    registry.register(TimeNowSkill())
    registry.register(SimpleCalculatorSkill())

