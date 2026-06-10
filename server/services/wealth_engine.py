"""
Wealth Engine — deterministic NW, FI score, velocity, milestone ETAs.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

MILESTONES_INR = [10_000_000, 50_000_000, 100_000_000]
HORIZON_CHECKPOINTS = [12, 36, 60, 120]
MAX_SIM_MONTHS = 600

DEFAULT_ASSUMPTIONS = {
    "equity_expected_return_pct": 11.0,
    "mf_expected_return_pct": 10.5,
    "bonds_expected_return_pct": 7.5,
    "fd_expected_return_pct": 7.0,
    "crypto_expected_return_pct": 8.0,
    "startup_equity_haircut_pct": 50.0,
    "inflation_pct": 6.0,
    "salary_growth_pct": 8.0,
    "fi_target_multiple": 25.0,
    "velocity_score_multiplier": 50.0,
}


def _f(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _monthly_rate(annual_pct: float) -> float:
    return (1 + annual_pct / 100) ** (1 / 12) - 1


def normalize_inputs(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Accept flat or nested snapshot; values in INR (not lakh)."""
    if "inputs" in raw:
        inp = raw["inputs"]
    else:
        inp = raw

    # Support lakh-form from client forms
    def lakh(key: str, alt: str) -> float:
        if inp.get(alt) is not None:
            return _f(inp.get(alt))
        lk = inp.get(f"{key}_lakh") or inp.get(key)
        if lk is not None and _f(lk) < 1_000_000 and key not in ("salary", "expenses"):
            return _f(lk) * 100_000
        return _f(lk)

    salary = _f(inp.get("salary_monthly_inr") or inp.get("salary_monthly") or lakh("salary", "salary_monthly_inr"))
    if salary == 0:
        annual_lakh = _f(inp.get("annual_income_lakh"))
        if annual_lakh:
            salary = annual_lakh * 100_000 / 12

    expenses = _f(inp.get("expenses_monthly_inr") or inp.get("expenses_monthly") or lakh("expenses", "expenses_monthly_inr"))
    side = _f(inp.get("side_income_monthly_inr") or inp.get("side_income_monthly"))

    nw_lakh = _f(inp.get("net_worth_lakh"))
    net_worth = _f(inp.get("net_worth_inr"))
    if net_worth == 0 and nw_lakh:
        net_worth = nw_lakh * 100_000

    emergency = _f(inp.get("emergency_fund_inr") or inp.get("emergency_fund"))
    equity = _f(inp.get("equity_investments_inr") or inp.get("equity_investments"))
    mf = _f(inp.get("mutual_funds_inr") or inp.get("mutual_funds"))
    bonds = _f(inp.get("bonds_inr") or inp.get("bonds"))
    fds = _f(inp.get("fds_inr") or inp.get("fds"))
    crypto = _f(inp.get("crypto_inr") or inp.get("crypto"))
    startup_eq = _f(inp.get("startup_equity_inr") or inp.get("startup_equity"))
    haircut = _f(inp.get("startup_equity_haircut_pct"), DEFAULT_ASSUMPTIONS["startup_equity_haircut_pct"])
    method = inp.get("startup_equity_valuation") or "discounted"
    if method in ("discounted", "cost"):
        startup_eq *= 1 - haircut / 100

    liabilities = _f(inp.get("liabilities_inr"))

    assumptions = {**DEFAULT_ASSUMPTIONS, **(inp.get("assumptions") or raw.get("assumptions") or {})}

    return {
        "salary_monthly_inr": salary,
        "expenses_monthly_inr": expenses,
        "side_income_monthly_inr": side,
        "emergency_fund_inr": emergency,
        "equity_investments_inr": equity,
        "mutual_funds_inr": mf,
        "bonds_inr": bonds,
        "fds_inr": fds,
        "crypto_inr": crypto,
        "startup_equity_inr": startup_eq,
        "liabilities_inr": liabilities,
        "net_worth_inr": net_worth,
        "assumptions": assumptions,
    }


def data_completeness(inputs: Dict[str, Any]) -> float:
    weights = {
        "salary_monthly_inr": 0.15,
        "expenses_monthly_inr": 0.15,
        "emergency_fund_inr": 0.10,
        "equity_investments_inr": 0.125,
        "mutual_funds_inr": 0.125,
        "bonds_inr": 0.075,
        "fds_inr": 0.075,
        "crypto_inr": 0.05,
        "startup_equity_inr": 0.05,
        "side_income_monthly_inr": 0.10,
    }
    total = 0.0
    for k, w in weights.items():
        if k in inputs and inputs[k] is not None:
            total += w
    return round(total, 2)


def compute_metrics(inputs: Dict[str, Any]) -> Dict[str, Any]:
    inp = normalize_inputs(inputs)
    a = inp["assumptions"]

    salary = inp["salary_monthly_inr"]
    side = inp["side_income_monthly_inr"]
    expenses = inp["expenses_monthly_inr"]
    income = salary + side
    monthly_savings = income - expenses
    savings_rate = _clamp((monthly_savings / income * 100) if income > 0 else 0, -100, 100)

    gross_assets = (
        inp["emergency_fund_inr"]
        + inp["equity_investments_inr"]
        + inp["mutual_funds_inr"]
        + inp["bonds_inr"]
        + inp["fds_inr"]
        + inp["crypto_inr"]
        + inp["startup_equity_inr"]
    )
    net_worth = gross_assets - inp["liabilities_inr"]
    if inp["net_worth_inr"] > 0:
        net_worth = inp["net_worth_inr"]

    investable = gross_assets - inp["emergency_fund_inr"]
    if investable < 0:
        investable = 0

    classes = [
        (inp["equity_investments_inr"], _f(a.get("equity_expected_return_pct"), 11)),
        (inp["mutual_funds_inr"], _f(a.get("mf_expected_return_pct"), 10.5)),
        (inp["bonds_inr"], _f(a.get("bonds_expected_return_pct"), 7.5)),
        (inp["fds_inr"], _f(a.get("fd_expected_return_pct"), 7)),
        (inp["crypto_inr"], _f(a.get("crypto_expected_return_pct"), 8)),
        (inp["startup_equity_inr"], 0.0),
    ]
    if investable > 0:
        blended = sum(v * r for v, r in classes) / investable
    else:
        blended = 10.0

    annual_exp = expenses * 12
    fi_target = annual_exp * _f(a.get("fi_target_multiple"), 25)
    fi_ratio = (investable / fi_target) if fi_target > 0 else 0
    fi_score = _clamp(fi_ratio * 100, 0, 100)

    annual_savings = monthly_savings * 12
    annual_growth = investable * (blended / 100)
    annual_velocity = annual_savings + annual_growth
    velocity_ratio = annual_velocity / max(income * 12, 1)
    velocity_score = _clamp(velocity_ratio * _f(a.get("velocity_score_multiplier"), 50), 0, 100)

    return {
        "net_worth_inr": round(net_worth, 2),
        "investable_wealth_inr": round(investable, 2),
        "gross_assets_inr": round(gross_assets, 2),
        "monthly_savings_inr": round(monthly_savings, 2),
        "savings_rate_pct": round(savings_rate, 2),
        "fi_score": round(fi_score, 2),
        "wealth_velocity_score": round(velocity_score, 2),
        "velocity_inr_per_month": round(annual_velocity / 12, 2),
        "blended_return_pct": round(blended, 2),
        "emergency_fund_months": round(inp["emergency_fund_inr"] / expenses, 2) if expenses > 0 else 0,
        "data_completeness": data_completeness(inp),
        "inputs_normalized": inp,
    }


def _simulate_monthly(
    inputs: Dict[str, Any],
    metrics: Dict[str, Any],
    blended_return_pct: float,
    salary_mult: float = 1.0,
    salary_growth_bonus: float = 0.0,
    savings_slippage: float = 1.0,
    income_gap_months: int = 0,
) -> List[float]:
    inp = inputs["inputs_normalized"] if "inputs_normalized" in inputs else normalize_inputs(inputs)
    a = inp["assumptions"]
    salary_g = _f(a.get("salary_growth_pct")) + salary_growth_bonus
    infl = _f(a.get("inflation_pct"))
    sg_m = _monthly_rate(salary_g)
    inf_m = _monthly_rate(infl)
    ret_m = _monthly_rate(blended_return_pct)

    salary_base = inp["salary_monthly_inr"]
    side_base = inp["side_income_monthly_inr"]
    exp_base = inp["expenses_monthly_inr"]
    emergency = inp["emergency_fund_inr"]
    portfolio = metrics["investable_wealth_inr"]

    nw_series = [metrics["net_worth_inr"]]
    cash = emergency

    for t in range(1, MAX_SIM_MONTHS + 1):
        gap = t <= income_gap_months
        salary_t = 0 if gap else salary_base * salary_mult * ((1 + sg_m) ** max(0, t - income_gap_months))
        side_t = side_base * ((1 + sg_m) ** t)
        income_t = salary_t + side_t
        expenses_t = exp_base * ((1 + inf_m) ** t)
        savings_t = (income_t - expenses_t) * savings_slippage
        deploy = savings_t * 0.85 if savings_t > 0 else savings_t
        cash += savings_t - deploy if savings_t > 0 else 0
        if savings_t < 0:
            shortfall = -savings_t
            from_cash = min(cash, shortfall)
            cash -= from_cash
            portfolio -= shortfall - from_cash
            deploy = -(shortfall - from_cash)
        portfolio = max(0, portfolio + deploy) * (1 + ret_m)
        nw_series.append(cash + portfolio)
    return nw_series


def project_milestones(
    inputs: Dict[str, Any],
    metrics: Dict[str, Any],
    milestones: Optional[List[float]] = None,
) -> Dict[str, Any]:
    milestones = milestones or MILESTONES_INR
    inp = metrics.get("inputs_normalized") or normalize_inputs(inputs)
    blended = metrics["blended_return_pct"]
    bands = {
        "pessimistic": (blended - 3, 0.9, -2),
        "base": (blended, 1.0, 0),
        "optimistic": (blended + 2, 1.1, 3),
    }
    result: Dict[str, Any] = {"milestones": {}, "checkpoints": {}}
    base_series = _simulate_monthly(inp, metrics, blended)

    for label, (ret, slip, sg_bonus) in bands.items():
        series = _simulate_monthly(inp, metrics, ret, savings_slippage=slip, salary_growth_bonus=sg_bonus)
        if label == "base":
            for h in HORIZON_CHECKPOINTS:
                if h < len(series):
                    result["checkpoints"][str(h)] = {"base_nw_inr": round(series[h], 2)}

        for m_inr in milestones:
            key = str(int(m_inr))
            if key not in result["milestones"]:
                result["milestones"][key] = {"already_achieved": metrics["net_worth_inr"] >= m_inr}
            already = metrics["net_worth_inr"] >= m_inr
            months = 0 if already else None
            if not already:
                for t, nw in enumerate(series):
                    if nw >= m_inr:
                        months = t
                        break
            proj = None
            if months is not None and months > 0:
                proj = (date.today() + timedelta(days=months * 30)).isoformat()
            result["milestones"][key][label] = {
                "months": months,
                "projected_date": proj,
            }

    return result


def compute(inputs: Dict[str, Any]) -> Dict[str, Any]:
    metrics = compute_metrics(inputs)
    milestones = project_milestones(inputs, metrics)
    return {**metrics, **milestones, "disclaimer": "Illustrative projections, not investment advice."}
