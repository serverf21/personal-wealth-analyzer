"""
North Star orchestrator — runs all engines and assembles unified payload.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from services import knowledge_graph
from services import recommendation_engine
from services import startup_opportunity_engine
from services import wealth_engine
from services import wealth_simulation_engine
from services.wealth_engine import normalize_inputs, _f


def _portfolio_from_inputs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    inp = normalize_inputs(inputs)
    total = (
        inp["equity_investments_inr"]
        + inp["mutual_funds_inr"]
        + inp["bonds_inr"]
        + inp["fds_inr"]
        + inp["crypto_inr"]
    ) or 1
    weights = sorted(
        [
            inp["equity_investments_inr"] / total,
            inp["mutual_funds_inr"] / total,
            inp["bonds_inr"] / total,
        ],
        reverse=True,
    )
    top3 = sum(weights[:3]) * 100
    top1 = weights[0] * 100 if weights else 0
    hhi = sum(w * w for w in weights)
    return {"top1_weight_pct": round(top1, 2), "top3_weight_pct": round(top3, 2), "hhi": round(hhi, 4), "copilot_conviction_avg": 50}


def _market_conditions() -> Dict[str, Any]:
    try:
        import json
        from pathlib import Path
        path = Path(__file__).resolve().parent.parent / "config" / "market_trends.json"
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"regime": "sideways", "index_return_3m": 0.04, "volatility_pct": 14}


def compute(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    inputs = snapshot.get("inputs") or snapshot
    career = snapshot.get("career_profile") or {}
    horizon_profile = snapshot.get("horizon_profile") or "balanced"
    user_id = snapshot.get("user_id", "default")

    wealth_metrics = wealth_engine.compute({"inputs": inputs})
    simulation = wealth_simulation_engine.run_all(inputs, wealth_metrics)

    skill_profile = {
        "skills": career.get("skills", snapshot.get("skills", [])),
        "wealth_context": inputs,
        "runway_months": wealth_metrics.get("emergency_fund_months", 0),
        "risk_tolerance": _f(snapshot.get("risk_tolerance"), 50),
    }
    startup_opportunities = startup_opportunity_engine.run(skill_profile)

    rec_context = {
        "inputs": inputs,
        "inputs_normalized": wealth_metrics.get("inputs_normalized"),
        "metrics": wealth_metrics,
        "simulation": simulation,
        "startup_opportunities": startup_opportunities,
        "career_profile": career,
        "portfolio": _portfolio_from_inputs(inputs),
        "market_conditions": _market_conditions(),
    }
    recommendations = recommendation_engine.recommend(rec_context, horizon_profile)

    payload_for_graph = {
        "user_id": user_id,
        "inputs": wealth_metrics.get("inputs_normalized") or normalize_inputs(inputs),
        "wealth_metrics": wealth_metrics,
        "simulation": simulation,
        "startup_opportunities": startup_opportunities,
        "recommendations": recommendations,
        "career_profile": career,
        "risk_tolerance": snapshot.get("risk_tolerance"),
    }
    graph_snapshot = knowledge_graph.sync_graph(payload_for_graph)
    reasoning = knowledge_graph.query_graph(
        "fastest_to_goal",
        {"goal_target_inr": _f(snapshot.get("target_milestone_inr"), 100_000_000)},
    )

    return {
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "wealth_metrics": wealth_metrics,
        "simulation": simulation,
        "startup_opportunities": startup_opportunities,
        "recommendations": recommendations,
        "knowledge_graph": graph_snapshot,
        "reasoning": reasoning,
        "disclaimer": "North Star projections are illustrative, not investment advice.",
    }
