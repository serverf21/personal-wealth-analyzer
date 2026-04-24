from typing import Any, Dict, List, Optional
import json
from openai import AsyncOpenAI


class AIMWealthDistributionAnalyzer:
    def __init__(self, api_key: str, model: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    def _context(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "inputs": payload.get("inputs") or {},
            "computed_distribution": payload.get("computed_distribution") or {},
            "reference_bands": payload.get("reference_bands") or [],
        }

    async def generate_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        context = self._context(payload)

        system = (
            "You are an expert Indian personal finance advisor. "
            "The user provided net worth, optional annual recurring income, upcoming expenses (with horizon), and optional notes. "
            "computed_distribution contains IDEAL rupee ranges per segment (from reference % bands × net worth), plus any rule-based manual_alerts/manual_hints. "
            "You do NOT sell products. Output valid JSON only, no markdown fences."
        )

        user = f"""
Context (JSON):
{json.dumps(context, indent=2)}

Tasks:
1. Summarize how the ideal six-segment split relates to their net worth and income/upcoming expenses.
2. **Upcoming expenses:** If upcoming_expenses_lakh is set, compare to the short-term segment's suggested range. If there is a gap, explain how to fund it — **which segment(s) are relatively safer to draw from first** (generally: speculative → growth → safe/stable; avoid emergency/insurance unless necessary — say why).
3. **Boosting one bucket:** Explain how someone could **increase allocation to one segment** (e.g. emergency, insurance) by **reducing another**, and whether that trade is usually **safe vs risky** (e.g. cutting speculative to build emergency is usually safer than cutting emergency for growth).
4. Use manual_alerts and manual_hints as inputs; do not contradict them without brief justification.
5. Insurance: only if notes mention policies/premiums; otherwise brief generic reminder on health/term adequacy.

Return JSON with keys:
- summary: string (2-4 sentences)
- upcoming_expenses_funding: string (empty if no upcoming amount) — plain language on covering that spend from which buckets
- funding_options_for_upcoming: array of objects {{ "from_segment": string, "why": string, "relative_safety": "safer" | "moderate" | "riskier" }} ordered **safest draw first** (conceptually: where to take money first with least long-term harm)
- boost_sector_advice: string — how to reallocate if user wants to **grow** one segment (e.g. emergency) and what to trim; safety trade-offs
- segment_assessment: array of {{ "segment_id", "message" }} for each of the six segments (role vs their situation)
- increase_priority: array of strings (what to build first, ordered)
- decrease_priority: array of strings (what to trim if cash is needed, ordered)
- insurance_notes: string or null
- risks_and_gaps: array of short strings
- disclaimer: string (not personalized investment advice; user should verify with a professional)
"""

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.35,
        )

        content = (resp.choices[0].message.content or "").strip()
        content = content.replace("```json", "").replace("```", "").strip()
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return {"data": parsed, "raw": content}
        except Exception:
            pass
        return {"raw": content}

    async def ask(
        self,
        payload: Dict[str, Any],
        question: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        context = self._context(payload)
        system = (
            "You are an expert Indian personal finance advisor. "
            "Answer using the snapshot: net worth, income, upcoming expenses, ideal segment ranges, and any alerts. "
            "For reallocation questions, name which segment to reduce and which to increase, and comment on safety (e.g. taking from speculative vs emergency). "
            "Be concise."
        )
        messages: List[Dict[str, str]] = [{"role": "system", "content": system}]
        messages.append(
            {
                "role": "user",
                "content": f"Snapshot:\n{json.dumps(context, indent=2)}",
            }
        )
        if history:
            for m in history[-8:]:
                if m.get("role") in ("user", "assistant") and isinstance(
                    m.get("content"), str
                ):
                    messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": question})

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.4,
        )
        return {"answer": (resp.choices[0].message.content or "").strip()}
