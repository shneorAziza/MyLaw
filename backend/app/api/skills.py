from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import SkillSpecOut
from app.skills.registry import registry


router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillSpecOut])
def list_skills() -> list[SkillSpecOut]:
    return [SkillSpecOut(**s) for s in registry.list_specs()]

