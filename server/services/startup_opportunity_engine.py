"""
Startup Opportunity Engine — skill-matched ideas ranked by wealth creation potential.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.wealth_engine import _clamp, _f, normalize_inputs

TEMPLATES_PATH = Path(__file__).resolve().parent.parent / "config" / "startup_idea_templates.json"
TRENDS_PATH = Path(__file__).resolve().parent.parent / "config" / "market_trends.json"


def _load_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _normalize_skill(name: str) -> str:
    return name.lower().strip().replace(" ", "_")


def _skill_fit(template: Dict[str, Any], user_skills: List[Dict[str, Any]]) -> float:
    skill_map = {_normalize_skill(s.get("name", "")): _f(s.get("proficiency", s.get("proficiency_1_5", 3)), 3) for s in user_skills}
    required = [_normalize_skill(x) for x in template.get("required_skills", [])]
    optional = [_normalize_skill(x) for x in template.get("optional_skills", [])]
    if not required:
        return 50.0
    matched = sum(1 for r in required if r in skill_map)
    req_match = matched / len(required)
    prof = sum(skill_map.get(r, 0) for r in required if r in skill_map) / max(matched, 1) / 5
    opt_match = sum(1 for o in optional if o in skill_map) / max(len(optional), 1) if optional else 0
    return _clamp(0.65 * req_match * 100 + 0.25 * prof * 100 + 0.10 * opt_match * 100, 0, 100)


def _revenue_projection(template: Dict[str, Any], skill_fit: float, band: str) -> Dict[str, float]:
    model = template.get("revenue_model", "saas_mrr")
    ttf = int(template.get("time_to_first_revenue_months", 4))
    if band == "pessimistic":
        ttf += 3
        g_mult = 0.7
        cap_mult = 0.85
    elif band == "optimistic":
        g_mult = 1.2
        cap_mult = 1.3
    else:
        g_mult = 1.0
        cap_mult = 1.0

    cumulative = 0.0
    mrr_12 = mrr_36 = 0.0
    if model == "saas_mrr":
        mrr_0 = 30000 * (skill_fit / 100)
        g = 0.10 * g_mult
        cap = 500000 * cap_mult
        for m in range(1, 61):
            if m < ttf:
                continue
            mrr = min(cap, mrr_0 * ((1 + g) ** (m - ttf)))
            cumulative += mrr * 0.75
            if m == 12:
                mrr_12 = mrr
            if m == 36:
                mrr_36 = mrr
    elif model == "consulting_ramp":
        rate = 3500
        for m in range(1, 61):
            if m < ttf:
                continue
            hours = min(120, 30 + (m - ttf) * 3)
            rev = hours * rate * 0.7
            cumulative += rev
            if m == 12:
                mrr_12 = rev
            if m == 36:
                mrr_36 = rev
    else:
        subs = 0
        for m in range(1, 61):
            if m < ttf:
                continue
            subs = min(500, subs + 8 * g_mult)
            rev = subs * 299
            cumulative += rev
            if m == 12:
                mrr_12 = rev
            if m == 36:
                mrr_36 = rev

    exit_inr = 0.0
    if band == "optimistic":
        exit_inr = min(_f(template.get("wealth_ceiling_inr_5y"), 2e7), mrr_36 * 12 * 3)

    return {
        "m12_mrr": round(mrr_12, 2),
        "m36_mrr": round(mrr_36, 2),
        "cumulative_5y": round(cumulative, 2),
        "exit_inr": round(exit_inr, 2),
    }


def _difficulty(template: Dict[str, Any], skill_fit: float, profile: Dict[str, Any]) -> float:
    required = template.get("required_skills", [])
    user_skills = {_normalize_skill(s.get("name", "")) for s in profile.get("skills", [])}
    gaps = sum(1 for r in required if _normalize_skill(r) not in user_skills)
    runway = _f(profile.get("runway_months"), 12)
    capital = _f(template.get("capital_required_inr"), 100000)
    cap_score = _clamp(capital / max(runway * 50000, 1) * 50, 0, 100)
    return _clamp(
        0.25 * _f(template.get("base_difficulty"), 50)
        + 0.20 * cap_score
        + 0.20 * _f(template.get("regulatory_burden"), 30)
        + 0.15 * _f(template.get("sales_complexity"), 40)
        + 0.10 * gaps * 15
        + 0.10 * min(int(template.get("time_to_first_revenue_months", 4)) / 12, 1) * 40,
        0,
        100,
    )


def _wealth_score(expected: float, p_success: float) -> float:
    adj = expected * p_success
    lo, hi = 500_000, 20_000_000
    if adj <= lo:
        return _clamp(adj / lo * 30, 0, 30)
    return _clamp((math.log(adj) - math.log(lo)) / (math.log(hi) - math.log(lo)) * 100, 0, 100)


def run(profile: Dict[str, Any], top_n: int = 10) -> Dict[str, Any]:
    templates = _load_json(TEMPLATES_PATH)
    trends = _load_json(TRENDS_PATH)
    vertical_trends = trends.get("vertical_trends", {})

    wealth_ctx = profile.get("wealth_context", {})
    inp = normalize_inputs(wealth_ctx)
    expenses = inp["expenses_monthly_inr"]
    emergency = inp["emergency_fund_inr"]
    ef_mo = emergency / expenses if expenses > 0 else 0
    runway = _f(profile.get("runway_months"), ef_mo)
    risk_tol = _f(profile.get("risk_tolerance"), 50)

    ideas: List[Dict[str, Any]] = []
    for tmpl in templates:
        fit = _skill_fit(tmpl, profile.get("skills", []))
        if fit < 40:
            continue
        vertical = tmpl.get("vertical", "saas")
        trend = _f(vertical_trends.get(vertical), 70)
        opp = _clamp(fit * 0.55 + trend * 0.30 + 70 * 0.15, 0, 100)
        diff = _difficulty(tmpl, fit, profile)
        capital = _f(tmpl.get("capital_required_inr"), 100000)

        if runway < capital / max(expenses, 1) / 2:
            continue
        if ef_mo < 6 and capital > 200000:
            continue
        if risk_tol < 30 and diff > 70:
            continue

        proj = {
            "pessimistic": _revenue_projection(tmpl, fit, "pessimistic"),
            "base": _revenue_projection(tmpl, fit, "base"),
            "optimistic": _revenue_projection(tmpl, fit, "optimistic"),
        }
        w_p = proj["pessimistic"]["cumulative_5y"]
        w_b = proj["base"]["cumulative_5y"] + proj["base"].get("exit_inr", 0)
        w_o = proj["optimistic"]["cumulative_5y"] + proj["optimistic"].get("exit_inr", 0)
        expected = 0.25 * w_p + 0.55 * w_b + 0.20 * w_o
        p_succ = _clamp(
            0.30 * (fit / 100) + 0.25 * min(runway / 18, 1) + 0.20 * (1 - diff / 100) + 0.15 * (opp / 100) + 0.10 * min(ef_mo / 12, 1),
            0.08,
            0.75,
        )
        wcs = _wealth_score(expected, p_succ)

        required = tmpl.get("required_skills", [])
        user_skill_map = {_normalize_skill(s.get("name", "")): s for s in profile.get("skills", [])}
        matched = [r for r in required if _normalize_skill(r) in user_skill_map]
        gaps = [{"skill": r, "learn_hours_est": 40} for r in required if _normalize_skill(r) not in user_skill_map]

        linked = "D" if tmpl.get("revenue_model") == "consulting_ramp" else "C"

        ideas.append({
            "id": tmpl["id"],
            "title": tmpl["title"],
            "vertical": vertical,
            "wealth_creation_score": round(wcs, 1),
            "expected_wealth_inr_5y": round(expected, 2),
            "p_success_pct": round(p_succ * 100, 1),
            "opportunity_score": round(opp, 1),
            "skill_fit": round(fit, 1),
            "difficulty": round(diff, 1),
            "capital_required_inr": capital,
            "time_to_first_revenue_months": tmpl.get("time_to_first_revenue_months"),
            "revenue_projection": proj,
            "required_skills": {
                "coverage_pct": round(len(matched) / max(len(required), 1) * 100, 1),
                "matched": matched,
                "gaps": gaps,
            },
            "gtm_roadmap": {
                "phases": [
                    {"phase": "validate", "months": [0, 2], "milestones": ["10 customer interviews", "Landing page live"]},
                    {"phase": "build_mvp", "months": [2, 5], "milestones": ["MVP with design partner"]},
                    {"phase": "launch", "months": [5, 8], "milestones": ["First paying customers"]},
                    {"phase": "scale", "months": [8, 24], "milestones": ["Repeatable acquisition channel"]},
                ]
            },
            "linked_simulation": linked,
            "one_liner": f"{tmpl['title']} — skill fit {fit:.0f}%, trend {trend:.0f}",
        })

    ideas.sort(key=lambda x: (-x["wealth_creation_score"], x["difficulty"], x["time_to_first_revenue_months"]))
    for i, idea in enumerate(ideas[:top_n]):
        idea["rank"] = i + 1

    return {
        "profile_summary": {
            "top_skills": [s.get("name") for s in profile.get("skills", [])[:5]],
            "runway_months": runway,
            "verticals_scanned": list(vertical_trends.keys()),
        },
        "ideas": ideas[:top_n],
        "disclaimer": "Illustrative scenarios only; not business or investment advice.",
    }
