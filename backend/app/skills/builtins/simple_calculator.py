from __future__ import annotations
from app.skills.base import SkillContext


class SimpleCalculatorSkill:
    name = "simple_calculator"
    description = "Evaluates a simple mathematical expression and returns the result."

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "Math expression to evaluate, e.g. '2 + 2'"}
            },
            "required": ["expression"],
        }

    async def run(self, ctx: SkillContext, args: dict) -> dict:
        try:
            result = eval(args["expression"], {"__builtins__": {}}, {})  # noqa: S307
            return {"result": result}
        except Exception as e:
            return {"error": str(e)}
