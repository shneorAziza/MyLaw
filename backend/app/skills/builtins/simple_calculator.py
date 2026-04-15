from __future__ import annotations

from app.skills.base import SkillContext


class SimpleCalculatorSkill:
    name = "simple_calculator"
    description = "Evaluates basic arithmetic: add/sub/mul/div on two numbers."

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "op": {"type": "string", "enum": ["add", "sub", "mul", "div"]},
                "a": {"type": "number"},
                "b": {"type": "number"},
            },
            "required": ["op", "a", "b"],
            "additionalProperties": False,
        }

    async def run(self, ctx: SkillContext, args: dict) -> dict:
        op = args["op"]
        a = float(args["a"])
        b = float(args["b"])
        if op == "add":
            res = a + b
        elif op == "sub":
            res = a - b
        elif op == "mul":
            res = a * b
        elif op == "div":
            if b == 0:
                return {"error": "division_by_zero"}
            res = a / b
        else:
            return {"error": "invalid_op"}
        return {"result": res}

