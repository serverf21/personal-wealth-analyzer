"""
Wealth Simulation Engine — scenarios A–F with risk and P(success).
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.wealth_engine import normalize_inputs, _clamp, _monthly_rate, _f

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "simulation_scenarios.json"
HORIZONS = [12, 36, 60, 120]
MAX_MONTHS = 120


def _load_scenarios() -> Dict[str, Any]:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def _blended_return(inputs: Dict[str, Any], override: Optional[Dict[str, float]], adj: float) -> float:
    inp = normalize_inputs(inputs)
    a = inp["assumptions"]
    total = (
        inp["equity_investments_inr"]
        + inp["mutual_funds_inr"]
        + inp["bonds_inr"]
        + inp["fds_inr"]
        + inp["crypto_inr"]
    )
    if total <= 0:
        return 10.0 + adj
    if override:
        eq = override.get("equity", inp["equity_investments_inr"] / total)
        mf = override.get("mutual_funds", inp["mutual_funds_inr"] / total)
        debt = override.get("debt", 1 - eq - mf)
        return (
            eq * _f(a.get("equity_expected_return_pct"), 11)
            + mf * _f(a.get("mf_expected_return_pct"), 10.5)
            + debt * _f(a.get("fd_expected_return_pct"), 7)
            + adj
        )
    weights = [
        (inp["equity_investments_inr"], _f(a.get("equity_expected_return_pct"), 11)),
        (inp["mutual_funds_inr"], _f(a.get("mf_expected_return_pct"), 10.5)),
        (inp["bonds_inr"], _f(a.get("bonds_expected_return_pct"), 7.5)),
        (inp["fds_inr"], _f(a.get("fd_expected_return_pct"), 7)),
        (inp["crypto_inr"], _f(a.get("crypto_expected_return_pct"), 8)),
    ]
    return sum(v * r for v, r in weights) / total + adj


def _business_revenue(month: int, cfg: Dict[str, Any]) -> float:
    sid = cfg.get("id", "")
    if sid == "C":
        ramp_from = cfg.get("salary_ramp_from_month", 19)
        if month < ramp_from:
            return 0.0
        m = month - ramp_from + 1
        mrr_0 = _f(cfg.get("mrr_initial"), 25000)
        g = _f(cfg.get("mrr_growth_monthly_pct"), 12) / 100
        cap = _f(cfg.get("mrr_cap"), 800000)
        mrr = min(cap, mrr_0 * ((1 + g) ** m))
        return mrr * _f(cfg.get("founder_take_pct"), 0.6)
    if sid == "D":
        if month < 4:
            return 0.0
        hours_start = _f(cfg.get("billable_hours_start"), 40)
        hours_cap = _f(cfg.get("billable_hours_cap"), 120)
        rate = _f(cfg.get("billable_rate_inr"), 4000)
        util = _f(cfg.get("utilization_pct"), 0.7)
        progress = min(1.0, (month - 3) / 24)
        hours = hours_start + (hours_cap - hours_start) * progress
        return hours * rate * util
    return 0.0


def _salary_for_month(month: int, cfg: Dict[str, Any], inp: Dict[str, Any]) -> float:
    gap = int(cfg.get("income_gap_months", 0))
    mult = _f(cfg.get("salary_multiplier"), 1.0)
    ramp_from = cfg.get("salary_ramp_from_month")
    ramp_mult = _f(cfg.get("salary_ramp_multiplier"), 1.0)
    base = inp["salary_monthly_inr"]
    a = inp["assumptions"]
    sg = _monthly_rate(_f(a.get("salary_growth_pct")) + _f(cfg.get("salary_growth_bonus_pct"), 0))

    if month <= gap:
        return 0.0
    effective_mult = mult
    if ramp_from and month < ramp_from:
        effective_mult = mult if mult > 0 else ramp_mult
    elif ramp_from and month >= ramp_from:
        effective_mult = ramp_mult if mult == 0 else mult

    t = month - gap
    return base * effective_mult * ((1 + sg) ** t)


def simulate_scenario(
    scenario_id: str,
    inputs: Dict[str, Any],
    metrics: Dict[str, Any],
    band: str = "base",
    scenarios: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    scenarios = scenarios or _load_scenarios()
    cfg = {**scenarios.get(scenario_id, {})}
    inp = normalize_inputs(inputs)

    ret_adj = _f(cfg.get("return_adjustment_pct"), 0)
    alloc = cfg.get("allocation_override")
    if alloc and isinstance(alloc, dict) and "equity_shift_pct" in alloc:
        ret_adj += _f(alloc.get("equity_shift_pct")) * 0.1
        alloc = None

    blended = _blended_return(inp, alloc if isinstance(alloc, dict) and "equity" in alloc else None, ret_adj)
    if band == "pessimistic":
        blended -= 3
        income_mult, burn_mult = 0.9, 1.15
    elif band == "optimistic":
        blended += 2
        income_mult, burn_mult = 1.1, 0.85
    else:
        income_mult, burn_mult = 1.0, 1.0

    infl_m = _monthly_rate(_f(inp["assumptions"].get("inflation_pct"), 6))
    ret_m = _monthly_rate(blended)
    side_m = _monthly_rate(_f(inp["assumptions"].get("salary_growth_pct"), 8))

    portfolio = metrics["investable_wealth_inr"]
    cash = inp["emergency_fund_inr"]
    exp_base = inp["expenses_monthly_inr"]
    side_base = inp["side_income_monthly_inr"]
    one_time = _f(cfg.get("one_time_cost_inr"), 0)
    extra_burn = _f(cfg.get("extra_monthly_burn_inr"), 0)

    nw_series: List[float] = [metrics["net_worth_inr"]]
    cf_series: List[float] = [0.0]

    for t in range(1, MAX_MONTHS + 1):
        salary_t = _salary_for_month(t, cfg, inp) * income_mult
        side_t = side_base * ((1 + side_m) ** t)
        business_t = _business_revenue(t, cfg) * income_mult
        income_t = salary_t + side_t + business_t
        expenses_t = exp_base * ((1 + infl_m) ** t) + extra_burn * burn_mult
        otc = one_time if t == 1 else 0
        net_cf = income_t - expenses_t - otc
        cf_series.append(net_cf)

        deploy = net_cf * 0.85 if net_cf > 0 else net_cf
        cash += net_cf - deploy if net_cf > 0 else 0
        if net_cf < 0:
            shortfall = -net_cf
            from_cash = min(max(cash, 0), shortfall)
            cash -= from_cash
            portfolio -= shortfall - from_cash
            deploy = -(shortfall - from_cash)

        if scenario_id == "E" and band == "pessimistic" and t == 18:
            dd = _f(cfg.get("max_drawdown_assumption_pct"), 35) / 100
            portfolio *= 1 - dd

        portfolio = max(0, portfolio + deploy) * (1 + ret_m)
        nw_series.append(cash + portfolio)

    checkpoints: Dict[str, Any] = {}
    neg_months = sum(1 for c in cf_series[1:] if c < 0)
    for h in HORIZONS:
        if h < len(nw_series):
            checkpoints[str(h)] = {
                "net_worth_inr": round(nw_series[h], 2),
                "cumulative_cashflow_inr": round(sum(cf_series[1 : h + 1]), 2),
                "monthly_cashflow_inr": round(cf_series[h], 2),
                "emergency_fund_inr": round(cash, 2),
                "portfolio_inr": round(portfolio, 2),
            }

    risk = _clamp(
        0.30 * _f(cfg.get("base_income_risk"), 20)
        + 0.25 * (alloc.get("equity", 0.5) * 80 if alloc and "equity" in alloc else 30)
        + 0.20 * _clamp(100 - (cash / max(exp_base, 1) / 6 * 100), 0, 100)
        + 0.15 * (neg_months / MAX_MONTHS * 100)
        + 0.10 * 20,
        0,
        100,
    )

    return {
        "nw_series": nw_series,
        "cf_series": cf_series,
        "checkpoints": checkpoints,
        "risk_score_60": round(risk, 1),
    }


def _p_success(
    scenario_id: str,
    cfg: Dict[str, Any],
    base_cp: Dict[str, Any],
    scenario_cp: Dict[str, Any],
    baseline_cp: Dict[str, Any],
    metrics: Dict[str, Any],
    inp: Dict[str, Any],
) -> Dict[str, float]:
    prior = _f(cfg.get("prior_success_pct"), 50) / 100
    exp = inp["expenses_monthly_inr"]
    ef = metrics.get("emergency_fund_months", 0)
    out: Dict[str, float] = {}
    for h in HORIZONS:
        key = str(h)
        sc = scenario_cp.get(key, {})
        bl = baseline_cp.get(key, {})
        nw_s = sc.get("net_worth_inr", 0)
        nw_b = bl.get("net_worth_inr", 1) or 1
        nw_ratio = _clamp(nw_s / nw_b, 0, 1.2)
        cash_m = sc.get("emergency_fund_inr", 0) / max(exp, 1)
        cum = sc.get("cumulative_cashflow_inr", 0)
        cf_ok = 1.0 if cum >= -1_000_000 else 0.0
        adj = 0.40 * nw_ratio + 0.35 * _clamp(cash_m / 6, 0, 1) + 0.25 * cf_ok
        out[key] = round(_clamp(prior * adj * 100, 5, 95), 1)
    return out


def _path_score(nw_60_s: float, nw_60_a: float, p_success: float, risk: float) -> float:
    speed = _clamp(nw_60_s / max(nw_60_a, 1), 0, 2) / 2
    realism = p_success / 100
    risk_pen = risk / 100
    return round(((0.45 * speed + 0.40 * realism) * (1 - 0.25 * risk_pen)) * 100) / 100


def run_all(
    inputs: Dict[str, Any],
    metrics: Dict[str, Any],
    scenario_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    scenarios = _load_scenarios()
    scenario_ids = scenario_ids or list(scenarios.keys())
    inp = normalize_inputs(inputs)

    baseline = simulate_scenario("A", inputs, metrics, "base", scenarios)
    results: List[Dict[str, Any]] = []

    for sid in scenario_ids:
        if sid not in scenarios:
            continue
        cfg = scenarios[sid]
        bands: Dict[str, Any] = {}
        for band in ("pessimistic", "base", "optimistic"):
            sim = simulate_scenario(sid, inputs, metrics, band, scenarios)
            p_succ = _p_success(
                sid, cfg,
                sim["checkpoints"],
                sim["checkpoints"],
                baseline["checkpoints"],
                metrics,
                inp,
            ) if band == "base" else {}
            entry: Dict[str, Any] = {
                "checkpoints": sim["checkpoints"],
                "risk_scores": {str(h): sim["risk_score_60"] for h in HORIZONS},
            }
            if band == "base":
                entry["probability_success_pct"] = p_succ
            bands[band] = entry

        b60 = bands["base"]["checkpoints"].get("60", {})
        a60 = baseline["checkpoints"].get("60", {})
        ps60 = bands["base"].get("probability_success_pct", {}).get("60", 50)
        pscore = _path_score(
            b60.get("net_worth_inr", 0),
            a60.get("net_worth_inr", 1),
            ps60,
            simulate_scenario(sid, inputs, metrics, "base", scenarios)["risk_score_60"],
        )
        results.append({
            "id": sid,
            "name": cfg.get("name", sid),
            "bands": bands,
            "path_score": pscore,
        })

    results.sort(key=lambda x: x["path_score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return {
        "scenarios": results,
        "baseline_scenario_id": "A",
        "recommended_scenario_id": results[0]["id"] if results else "A",
        "horizons_months": HORIZONS,
        "disclaimer": "Projections are illustrative, not investment advice.",
    }
