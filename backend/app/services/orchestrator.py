from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Message, SkillInvocation
from app.services.llm import LLMClient, LLMResult
from app.skills.base import SkillContext
from app.skills.registry import SkillRegistry


class ChatOrchestrator:
    def __init__(self, *, llm: LLMClient, skills: SkillRegistry) -> None:
        self.llm = llm
        self.skills = skills

    async def run_turn(
        self,
        *,
        db: Session,
        user_id: str,
        chat_id: str,
        history: list[Message],
    ) -> tuple[Message, list[str]]:
        messages = [
            {"role": m.role, "content": m.content, "metadata": m.metadata_json, "id": m.id}
            for m in history
        ]

        tool_specs = self.skills.list_specs()
        first = await self.llm.generate(messages=messages, tools=tool_specs)
        created_message_ids: list[str] = []

        if first.tool_calls:
            ctx = SkillContext(user_id=user_id, chat_id=chat_id)
            for tc in first.tool_calls:
                skill = self.skills.get(tc.name)
                if skill is None:
                    tool_out = {"error": "unknown_skill", "name": tc.name}
                    status = "error"
                else:
                    try:
                        tool_out = await skill.run(ctx, tc.arguments)
                        status = "success"
                    except Exception as e:  # noqa: BLE001
                        tool_out = {"error": "skill_failed", "detail": str(e)}
                        status = "error"

                tool_msg = Message(
                    chat_id=chat_id,
                    role="tool",
                    content=str(tool_out),
                    metadata_json={"skill": tc.name},
                )
                db.add(tool_msg)
                db.flush()
                created_message_ids.append(tool_msg.id)

                db.add(
                    SkillInvocation(
                        message_id=tool_msg.id,
                        skill_name=tc.name,
                        input_json=tc.arguments,
                        output_json=tool_out,
                        status=status,
                    )
                )

                messages.append({"role": "tool", "content": str(tool_out), "metadata": {"skill": tc.name}})

            second: LLMResult = await self.llm.generate(messages=messages, tools=tool_specs)
            assistant_text = second.content or "(stub) tool executed"
            assistant_meta = second.metadata or {}
        else:
            assistant_text = first.content
            assistant_meta = first.metadata or {}

        assistant = Message(
            chat_id=chat_id,
            role="assistant",
            content=assistant_text,
            metadata_json=assistant_meta,
        )
        db.add(assistant)
        db.flush()
        created_message_ids.append(assistant.id)
        return assistant, created_message_ids

