"""
North Star Recommendation Engine — rank 7 wealth actions.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from services.wealth_engine import _clamp, _f, normalize_inputs

ACTIONS = [
    {"id": "invest_more", "label": "Invest more"},
    {"id": "save_more", "label": "Save more"},
    {"id": "build_startup", "label": "Build startup"},
    {"id": "upskill", "label": "Upskill"},
    {"id": "switch_job", "label": "Switch job"},
    {"id": "diversify", "label": "Diversify"},
    {"id": "concentrate_capital", "label": "Concentrate capital"},
]

HORIZON_WEIGHTS = {
    "near_term": {12: 0.50, 36: 0.35, 60: 0.15},
    "balanced": {12: 0.20, 36: 0.35, 60: 0.45},
    "long_term": {12: 0.10, 36: 0.30, 60: 0.60},
}


def _scenario_delta(simulation: Dict[str, Any], sid: str, month: str) -> float:
    for s in simulation.get("scenarios", []):
        if s["id"] == sid:
            cp = s.get("bands", {}).get("base", {}).get("checkpoints", {}).get(month, {})
            return _f(cp.get("net_worth_inr"))
    return 0.0


def _baseline_nw(simulation: Dict[str, Any], month: str) -> float:
    return _scenario_delta(simulation, "A", month)


def _impact_score(delta_inr: float, cap: float = 5_000_000) -> float:
    return _clamp(delta_inr / cap * 100, 0, 100)


def _score_invest_more(ctx: Dict[str, Any], h: int) -> Dict[str, float]:
    metrics = ctx["metrics"]
    market = ctx.get("market_conditions", {})
    inp = ctx.get("inputs_normalized") or normalize_inputs(ctx.get("inputs", {}))
    ef = metrics.get("emergency_fund_months", 0)
    sr = metrics.get("savings_rate_pct", 0) / 100
    eq_pct = 0.0
    inv = metrics.get("investable_wealth_inr", 1) or 1
    eq_pct = inp.get("equity_investments_inr", 0) / inv * 100 if inv else 0
    overval = _clamp((_f(market.get("index_return_3m")) - 0.15) * 200, 0, 40)
    feasibility = _clamp(0.35 * min(ef / 6, 1) * 100 + 0.35 * min(sr / 0.25, 1) * 100 + 0.30 * (100 - overval), 0, 100)
    urgency = _clamp((55 - eq_pct) * 2, 0, 100)
    sim = ctx.get("simulation", {})
    delta = _scenario_delta(sim, "E", str(h)) - _baseline_nw(sim, str(h))
    if ef < 6:
        feasibility = min(feasibility, 50)
    impact = _impact_score(max(0, delta))
    raw = 0.50 * impact + 0.30 * feasibility + 0.20 * urgency
    return {"score": round(raw, 1), "expected_nw_delta_inr": round(delta, 2), "impact": impact, "feasibility": feasibility, "urgency": urgency}


def _score_save_more(ctx: Dict[str, Any], h: int) -> Dict[str, float]:
    metrics = ctx["metrics"]
    sr = metrics.get("savings_rate_pct", 0) / 100
    ef = metrics.get("emergency_fund_months", 0)
    feasibility = _clamp(0.50 * (1 - min(sr / 0.45, 1)) * 100 + 0.50 * 70, 0, 100)
    if sr >= 0.55:
        feasibility = min(feasibility, 40)
    urgency = _clamp(0.60 * max(0, (0.35 - sr) / 0.35) * 100 + 0.40 * max(0, (6 - ef) / 6) * 100, 0, 100)
    delta = metrics.get("monthly_savings_inr", 0) * h * 0.8
    impact = _impact_score(delta)
    raw = 0.50 * impact + 0.30 * feasibility + 0.20 * urgency
    return {"score": round(raw, 1), "expected_nw_delta_inr": round(delta, 2), "impact": impact, "feasibility": feasibility, "urgency": urgency}


def _score_build_startup(ctx: Dict[str, Any], h: int) -> Dict[str, float]:
    metrics = ctx["metrics"]
    ef = metrics.get("emergency_fund_months", 0)
    ideas = ctx.get("startup_opportunities", {}).get("ideas", [])
    best = ideas[0] if ideas else {}
    domain_fit = _f(best.get("skill_fit"), 40)
    p_succ = _f(best.get("p_success_pct"), 30)
    sim = ctx.get("simulation", {})
    delta_c = _scenario_delta(sim, "C", str(h)) - _baseline_nw(sim, str(h))
    delta_d = _scenario_delta(sim, "D", str(h)) - _baseline_nw(sim, str(h))
    delta = max(delta_c, delta_d)
    feasibility = _clamp(0.30 * domain_fit + 0.30 * min(ef / 12, 1) * 100 + 0.40 * p_succ, 0, 100)
    if ef < 6:
        feasibility = min(feasibility, 25)
    urgency = domain_fit * 0.7
    impact = _impact_score(max(0, delta))
    raw = 0.50 * impact + 0.30 * feasibility + 0.20 * urgency
    return {"score": round(raw, 1), "expected_nw_delta_inr": round(delta, 2), "impact": impact, "feasibility": feasibility, "urgency": urgency}


def _score_upskill(ctx: Dict[str, Any], h: int) -> Dict[str, float]:
    career = ctx.get("career_profile", {})
    gap = max(0, 1 - _f(career.get("salary_vs_market_pct"), 1))
    skill_demand = _f(career.get("skill_demand_score"), 50)
    readiness = _f(career.get("upskill_readiness"), 50)
    feasibility = _clamp(0.40 * gap * 100 + 0.35 * skill_demand + 0.25 * readiness, 0, 100)
    urgency = skill_demand * 0.6
    delta = gap * 500_000 * (h / 36)
    impact = _impact_score(delta)
    raw = 0.50 * impact + 0.30 * feasibility + 0.20 * urgency
    return {"score": round(raw, 1), "expected_nw_delta_inr": round(delta, 2), "impact": impact, "feasibility": feasibility, "urgency": urgency}


def _score_switch_job(ctx: Dict[str, Any], h: int) -> Dict[str, float]:
    career = ctx.get("career_profile", {})
    metrics = ctx["metrics"]
    ef = metrics.get("emergency_fund_months", 0)
    gap = max(0, 1 - _f(career.get("salary_vs_market_pct"), 1))
    sim = ctx.get("simulation", {})
    b_sc = next((s for s in sim.get("scenarios", []) if s["id"] == "B"), None)
    p_succ = 60.0
    if b_sc:
        p_succ = b_sc.get("bands", {}).get("base", {}).get("probability_success_pct", {}).get("60", 60)
    feasibility = _clamp(0.40 * gap * 100 + 0.35 * p_succ + 0.25 * 60, 0, 100)
    if ef < 3:
        feasibility *= 0.7
    urgency = _clamp(gap * 120, 0, 100)
    delta = _scenario_delta(sim, "B", str(h)) - _baseline_nw(sim, str(h))
    impact = _impact_score(max(0, delta))
    raw = 0.50 * impact + 0.30 * feasibility + 0.20 * urgency
    return {"score": round(raw, 1), "expected_nw_delta_inr": round(delta, 2), "impact": impact, "feasibility": feasibility, "urgency": urgency}


def _score_diversify(ctx: Dict[str, Any], h: int) -> Dict[str, float]:
    portfolio = ctx.get("portfolio", {})
    top3 = _f(portfolio.get("top3_weight_pct"), 40)
    top1 = _f(portfolio.get("top1_weight_pct"), 15)
    hhi = _f(portfolio.get("hhi"), 0.1)
    conc = _clamp((hhi - 0.08) / 0.20 * 100, 0, 100)
    feasibility = _clamp(0.40 * conc + 0.30 * top3 / 80 * 100 + 0.30 * 40, 0, 100)
    urgency = conc
    sim = ctx.get("simulation", {})
    delta = _scenario_delta(sim, "F", str(h)) - _scenario_delta(sim, "E", str(h))
    impact = _impact_score(max(0, delta)) * 0.7 + 0.3 * conc
    raw = 0.50 * impact + 0.30 * feasibility + 0.20 * urgency
    return {"score": round(raw, 1), "expected_nw_delta_inr": round(delta, 2), "impact": impact, "feasibility": feasibility, "urgency": urgency}


def _score_concentrate(ctx: Dict[str, Any], h: int) -> Dict[str, float]:
    portfolio = ctx.get("portfolio", {})
    metrics = ctx["metrics"]
    top1 = _f(portfolio.get("top1_weight_pct"), 10)
    conviction = _f(portfolio.get("copilot_conviction_avg"), 50)
    ef = metrics.get("emergency_fund_months", 0)
    conc_room = max(0, 100 - top1 * 2)
    feasibility = _clamp(0.35 * conviction + 0.25 * 60 + 0.20 * conc_room + 0.20 * min(ef / 9, 1) * 100, 0, 100)
    if top1 > 30:
        feasibility = min(feasibility, 30)
    urgency = conviction * 0.8
    sim = ctx.get("simulation", {})
    delta = _scenario_delta(sim, "E", str(h)) - _scenario_delta(sim, "F", str(h))
    impact = _impact_score(max(0, delta))
    raw = 0.50 * impact + 0.30 * feasibility + 0.20 * urgency
    return {"score": round(raw, 1), "expected_nw_delta_inr": round(delta, 2), "impact": impact, "feasibility": feasibility, "urgency": urgency}


SCORERS = {
    "invest_more": _score_invest_more,
    "save_more": _score_save_more,
    "build_startup": _score_build_startup,
    "upskill": _score_upskill,
    "switch_job": _score_switch_job,
    "diversify": _score_diversify,
    "concentrate_capital": _score_concentrate,
}

SCENARIO_LINK = {
    "invest_more": "E",
    "save_more": "A",
    "build_startup": "C",
    "upskill": "B",
    "switch_job": "B",
    "diversify": "F",
    "concentrate_capital": "E",
}


def _resolve_conflicts(recs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id = {r["action_id"]: r for r in recs}
    div = by_id.get("diversify", {})
    conc = by_id.get("concentrate_capital", {})
    if div.get("composite_score", 0) > 60 and conc.get("composite_score", 0) > 60:
        portfolio = div  # placeholder — dampen both slightly
        div["composite_score"] = div["composite_score"] * 0.85
        conc["composite_score"] = conc["composite_score"] * 0.85
    return recs


def recommend(context: Dict[str, Any], horizon_profile: str = "balanced") -> Dict[str, Any]:
    weights = HORIZON_WEIGHTS.get(horizon_profile, HORIZON_WEIGHTS["balanced"])
    metrics = context.get("metrics", {})
    completeness = _f(metrics.get("data_completeness"), 0.5)

    recommendations: List[Dict[str, Any]] = []
    suppressed: List[Dict[str, Any]] = []

    for action in ACTIONS:
        aid = action["id"]
        scorer = SCORERS[aid]
        horizons: Dict[str, Any] = {}
        scores_list: List[float] = []
        for months, w in weights.items():
            h = scorer(context, months)
            horizons[str(months)] = {
                "score": h["score"],
                "expected_nw_delta_inr": h["expected_nw_delta_inr"],
                "projected_nw_inr": round(_baseline_nw(context.get("simulation", {}), str(months)) + h["expected_nw_delta_inr"], 2),
            }
            scores_list.append(h["score"])

        composite = sum(weights[m] * horizons[str(m)]["score"] for m in weights)
        variance = max(scores_list) - min(scores_list) if scores_list else 0
        sim_id = SCENARIO_LINK.get(aid, "A")
        p_sim = 70
        for s in context.get("simulation", {}).get("scenarios", []):
            if s["id"] == sim_id:
                p_sim = s.get("bands", {}).get("base", {}).get("probability_success_pct", {}).get("60", 70)
                break
        confidence = _clamp(
            0.35 * completeness * 100 + 0.35 * (1 - variance / 100) * 100 + 0.30 * _f(p_sim),
            20,
            92,
        )

        if aid == "concentrate_capital" and _f(context.get("portfolio", {}).get("top1_weight_pct")) > 30:
            suppressed.append({"action_id": aid, "reason": "Top position already >30% of portfolio"})
            continue

        h36 = horizons.get("36", {})
        h60 = horizons.get("60", {})
        delta_36 = _f(h36.get("expected_nw_delta_inr"))
        delta_60 = _f(h60.get("expected_nw_delta_inr"))
        last_scorer = scorer(context, 36)

        def _inr_fmt(amount: float) -> str:
            sign = "+" if amount >= 0 else "-"
            return f"{sign}₹{abs(amount):,.0f}"

        impact_label = "bullish" if delta_36 >= 0 else "bearish"
        recommendations.append({
            "rank": 0,
            "action_id": aid,
            "action_label": action["label"],
            "composite_score": round(composite, 1),
            "confidence_pct": round(confidence, 1),
            "horizons": horizons,
            "linked_simulation": sim_id,
            "reasoning_chain": {
                "summary": (
                    f"{action['label']}: score {composite:.1f}/100 ({horizon_profile}). "
                    f"3Y NW delta {_inr_fmt(delta_36)} vs status quo; 5Y {_inr_fmt(delta_60)}. "
                    f"Linked simulation {sim_id}. Confidence {confidence:.0f}%."
                ),
                "steps": [
                    {
                        "factor": "impact",
                        "finding": f"3-year expected NW change {_inr_fmt(delta_36)} (5Y {_inr_fmt(delta_60)})",
                        "impact": impact_label,
                    },
                    {
                        "factor": "feasibility",
                        "finding": f"Feasibility {last_scorer.get('feasibility', 0):.0f}/100, urgency {last_scorer.get('urgency', 0):.0f}/100",
                        "impact": "neutral",
                    },
                    {
                        "factor": "simulation",
                        "finding": f"Grounded in scenario {sim_id} (P(success)@60mo ≈ {p_sim:.0f}%)",
                        "impact": "bullish" if _f(p_sim) >= 55 else "neutral",
                    },
                ],
            },
            "prerequisites": [],
            "risks": [],
        })

    recommendations.sort(key=lambda x: x["composite_score"], reverse=True)
    recommendations = _resolve_conflicts(recommendations)
    recommendations.sort(key=lambda x: x["composite_score"], reverse=True)
    for i, r in enumerate(recommendations):
        r["rank"] = i + 1

    return {
        "horizon_profile": horizon_profile,
        "baseline_nw_inr": metrics.get("net_worth_inr", 0),
        "recommendations": recommendations,
        "suppressed_actions": suppressed,
        "disclaimer": "Illustrative projections, not personalized investment advice.",
    }
