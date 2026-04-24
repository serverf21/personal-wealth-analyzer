from typing import Any, Dict, List, Optional
import json
from openai import AsyncOpenAI


class AIMStockAnalyzer:
    def __init__(self, api_key: str, model: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    @staticmethod
    def _slim_enrichment(en: Any) -> Dict[str, Any]:
        if not isinstance(en, dict):
            return {}
        fund = en.get("fundamentals") or {}
        return {
            "yahoo_symbol": en.get("yahoo_symbol"),
            "error": en.get("error"),
            "short_name": fund.get("short_name"),
            "sector": fund.get("sector"),
            "industry": fund.get("industry"),
            "pe_trailing": fund.get("pe_trailing"),
            "market_cap": fund.get("market_cap"),
            "technical": en.get("technical") or {},
            "news_headlines": (en.get("news_headlines") or [])[:6],
        }

    def _context_payload(self, stock_payload: Dict[str, Any]) -> Dict[str, Any]:
        summary = stock_payload.get("summary") or {}
        computed = stock_payload.get("computed") or {}
        holdings = stock_payload.get("holdings") or []
        manual = stock_payload.get("manual_hints") or {}
        enrichment = stock_payload.get("enrichment") or {}

        trimmed_holdings = []
        for h in holdings[:40]:
            sym = h.get("symbol")
            trimmed_holdings.append(
                {
                    "symbol": sym,
                    "qty": h.get("qty"),
                    "invested_value": h.get("invested_value"),
                    "current_value": h.get("current_value"),
                    "pnl_pct": h.get("pnl_pct"),
                    "enrichment": self._slim_enrichment(enrichment.get(sym)),
                }
            )

        # Compact enrichment for top symbols only
        top_syms = [a.get("name") for a in (computed.get("allocation_by_symbol") or [])[:12]]
        en_small = {s: self._slim_enrichment(enrichment.get(s)) for s in top_syms if s}

        return {
            "summary": summary,
            "computed": {
                "allocation_by_symbol": (computed.get("allocation_by_symbol") or [])[:15],
                "concentration": computed.get("concentration") or {},
            },
            "manual_hints": {
                "alerts": (manual.get("alerts") or [])[:15],
                "trim_suggestions": (manual.get("trim_suggestions") or [])[:10],
                "sector_weights_pct": (manual.get("sector_weights_pct") or [])[:12],
            },
            "holdings_sample": trimmed_holdings,
            "enrichment_top": en_small,
        }

    async def generate_report(self, stock_payload: Dict[str, Any]) -> Dict[str, Any]:
        context = self._context_payload(stock_payload)

        system = (
            "You are an expert Indian equity portfolio analyst. "
            "Use the holdings snapshot, concentration metrics, Yahoo Finance enrichment (fundamentals, technicals, headlines), and manual rule-based hints. "
            "Emphasize current holdings, position sizing, and practical redistribution / rebalancing ideas aligned with recent news and fundamentals vs technicals. "
            "Be explicit that Yahoo data can be delayed or incomplete."
        )

        user = f"""
Analyze this direct-equity portfolio and produce a structured report.

Portfolio data (JSON):
{context}

Requirements:
- Tie recommendations to CURRENT weights and news headlines where relevant.
- Blend fundamental view (sector, PE, market cap) with technicals (RSI, 52w range).
- Propose redistribution: trim/add/rotate with rough priority (not exact order sizes unless clearly implied by weights).
- Output JSON with these keys:
  - risk_profile: one of ["low","moderate","high"]
  - key_findings: array of short bullets
  - redistribution_plan: array of objects {{action, symbol, rationale, priority}}
  - news_fundamental_thesis: array of objects {{symbol, headline_angle, fundamental_note}}
  - technical_notes: array of objects {{symbol, note}}
  - disclaimer: short string
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
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return {"data": parsed, "raw": content}
        except Exception:
            pass
        return {"raw": content}

    async def ask(
        self,
        stock_payload: Dict[str, Any],
        question: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        context = self._context_payload(stock_payload)

        system = (
            "You are an expert Indian equity portfolio analyst. "
            "Answer using the provided snapshot and enrichment. "
            "If data is missing, say what is missing and what the user should verify."
        )

        messages: List[Dict[str, str]] = [{"role": "system", "content": system}]
        messages.append(
            {
                "role": "user",
                "content": f"Equity portfolio snapshot (JSON):\n{context}",
            }
        )

        if history:
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
