from typing import Any, Dict, List, Optional
import json
from openai import AsyncOpenAI


class AIMFAnalyzer:
    def __init__(self, api_key: str, model: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    def _context_payload(self, mf_payload: Dict[str, Any]) -> Dict[str, Any]:
        summary = mf_payload.get("summary") or {}
        computed = mf_payload.get("computed") or {}
        holdings = mf_payload.get("holdings") or []

        # Trim holdings so prompts stay small.
        trimmed_holdings = []
        for h in holdings[:50]:
            trimmed_holdings.append(
                {
                    "scheme_name": h.get("scheme_name"),
                    "amc": h.get("amc"),
                    "category": h.get("category"),
                    "sub_category": h.get("sub_category"),
                    "source": h.get("source"),
                    "invested_value": h.get("invested_value"),
                    "current_value": h.get("current_value"),
                    "xirr_pct": h.get("xirr_pct"),
                }
            )

        return {
            "summary": summary,
            "computed": {
                "counts": (computed.get("counts") or {}),
                "allocation_by_category": (computed.get("allocation_by_category") or [])[:20],
                "allocation_by_sub_category": (computed.get("allocation_by_sub_category") or [])[:30],
                "allocation_by_amc": (computed.get("allocation_by_amc") or [])[:20],
                "top_schemes_by_current_value": (computed.get("top_schemes_by_current_value") or [])[:10],
            },
            "holdings_sample": trimmed_holdings,
        }

    async def generate_report(self, mf_payload: Dict[str, Any]) -> Dict[str, Any]:
        context = self._context_payload(mf_payload)

        system = (
            "You are an expert Indian mutual fund portfolio analyst. "
            "Use ONLY the provided portfolio data (holdings + computed allocations) and be explicit about assumptions. "
            "You do NOT have underlying stock holdings/sector allocations unless provided."
        )

        user = f"""
Analyze this mutual fund portfolio holdings snapshot and produce a structured report.

Portfolio data (JSON):
{context}

Requirements:
- Identify concentration risk (top scheme %, AMC concentration, category/sub-category concentration).
- Identify potential 'overlap' risks ONLY using what is available: repeated schemes across folios/sources, too many funds in same category/sub-category, too many thematic funds, etc.
- If the portfolio seems high risk, explain WHY (e.g., heavy Small Cap/Thematic, concentration in few funds) and suggest improvements.
- Give actionable recommendations: add/alter/improvise (e.g., diversify categories, reduce thematic exposure, consolidate duplicates).
- Output JSON with these keys:
  - risk_profile: one of ["low","moderate","high"]
  - key_findings: array of short bullets
  - concentration_flags: array of objects {{title, evidence, impact}}
  - overlap_signals: array of objects {{title, evidence, action}}
  - recommendations: array of objects {{title, why, how}}
  - disclaimer: short string
"""

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
        )

        content = (resp.choices[0].message.content or "").strip()
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return {"data": parsed, "raw": content}
        except Exception:
            pass
        return {"raw": content}

    async def ask(self, mf_payload: Dict[str, Any], question: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        context = self._context_payload(mf_payload)

        system = (
            "You are an expert Indian mutual fund portfolio analyst. "
            "Answer user questions using ONLY the provided portfolio snapshot. "
            "If the user asks for underlying stocks/sector exposure, explain that it's not available from the statement and suggest enabling MF metadata/NAV enrichment later."
        )

        messages: List[Dict[str, str]] = [{"role": "system", "content": system}]
        messages.append(
            {
                "role": "user",
                "content": f"Portfolio snapshot (JSON):\n{context}",
            }
        )

        if history:
            # history items are expected to be {"role": "user"|"assistant", "content": "..."}
            for m in history[-8:]:
                if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str):
                    messages.append({"role": m["role"], "content": m["content"]})

        messages.append({"role": "user", "content": question})

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.4,
        )

        content = (resp.choices[0].message.content or "").strip()
        return {"answer": content}

