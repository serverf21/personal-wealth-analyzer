from typing import Any, Dict, List, Optional
import json
from openai import AsyncOpenAI


class AINorthStarAnalyzer:
    def __init__(self, api_key: str, model: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    def _slim_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        wm = payload.get("wealth_metrics") or {}
        recs = (payload.get("recommendations") or {}).get("recommendations") or []
        sim = (payload.get("simulation") or {}).get("scenarios") or []
        ideas = (payload.get("startup_opportunities") or {}).get("ideas") or []
        return {
            "wealth_metrics": {
                "net_worth_inr": wm.get("net_worth_inr"),
                "fi_score": wm.get("fi_score"),
                "wealth_velocity_score": wm.get("wealth_velocity_score"),
                "savings_rate_pct": wm.get("savings_rate_pct"),
                "milestones": wm.get("milestones"),
            },
            "top_recommendations": recs[:3],
            "top_simulations": [{"id": s.get("id"), "name": s.get("name"), "path_score": s.get("path_score"), "rank": s.get("rank")} for s in sim[:3]],
            "top_startup_ideas": [{"title": i.get("title"), "wealth_creation_score": i.get("wealth_creation_score")} for i in ideas[:3]],
            "reasoning": payload.get("reasoning", {}).get("answer", {}),
        }

    async def generate_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        context = self._slim_payload(payload)
        system = (
            "You are an expert Indian personal finance strategist for North Star Mode. "
            "Use ONLY numbers from the JSON context. Do not invent ETAs or reorder recommendations. "
            "Output valid JSON only, no markdown fences."
        )
        user = f"""
Context (JSON):
{json.dumps(context, indent=2)}

Tasks:
1. Summarize current wealth position and top milestone gap.
2. Explain the top 3 recommended actions using provided scores and deltas.
3. Note top simulation scenario and startup idea if present.
4. One paragraph on risks.

Return JSON with keys:
- summary: string
- top_actions_explained: array of {{ "action", "why", "horizon_note" }}
- simulation_note: string
- startup_note: string or null
- risks: array of strings
- disclaimer: string
"""
        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
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
        context = self._slim_payload(payload)
        system = (
            "You are an expert Indian personal finance strategist. "
            "Answer using the North Star payload only. Do not invent numbers."
        )
        messages: List[Dict[str, str]] = [{"role": "system", "content": system}]
        if history:
            messages.extend(history[-8:])
        messages.append({
            "role": "user",
            "content": f"Context:\n{json.dumps(context)}\n\nQuestion: {question}",
        })
        resp = await self.client.chat.completions.create(model=self.model, messages=messages, temperature=0.35)
        return {"answer": (resp.choices[0].message.content or "").strip()}
