"""
Investment Copilot — per-symbol signals with confidence and reasoning chains.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from services.stock_market_data import fetch_symbol_enrichment
from services.wealth_engine import _clamp, _f

Signal = Literal["Buy", "Accumulate", "Hold", "Reduce", "Exit"]
Horizon = Literal["short", "medium", "long"]

HORIZON_WEIGHTS = {
    "short": {"technical": 0.35, "fundamental": 0.15, "valuation": 0.15, "earnings": 0.15, "sentiment": 0.20},
    "medium": {"technical": 0.20, "fundamental": 0.25, "valuation": 0.25, "earnings": 0.20, "sentiment": 0.10},
    "long": {"technical": 0.10, "fundamental": 0.30, "valuation": 0.30, "earnings": 0.25, "sentiment": 0.05},
}

POS_WORDS = {"beat", "upgrade", "record", "growth", "profit", "surge", "strong"}
NEG_WORDS = {"downgrade", "fraud", "probe", "miss", "cut", "loss", "weak", "fall"}


def _yahoo_symbol(symbol: str, market: str = "IN") -> str:
    s = symbol.upper().strip()
    if market == "US":
        return s
    if s.endswith(".NS") or s.endswith(".BO"):
        return s
    return f"{s}.NS"


def _technical_score(tech: Dict[str, Any]) -> float:
    rsi = _f(tech.get("rsi14"), 50)
    rsi_s = 100 - abs(rsi - 45) * 1.2
    label = tech.get("range_label", "mid_range")
    range_s = 70 if label == "near_52w_low" else 40 if label == "near_52w_high" else 55
    sma20 = _f(tech.get("sma20"))
    sma50 = _f(tech.get("sma50"))
    last = _f(tech.get("last_close"))
    trend_s = 60
    if sma20 and sma50 and last:
        if last > sma20 > sma50:
            trend_s = 75
        elif last < sma50:
            trend_s = 35
    return _clamp(0.4 * rsi_s + 0.35 * range_s + 0.25 * trend_s, 0, 100)


def _fundamental_score(fund: Dict[str, Any]) -> float:
    pe = _f(fund.get("pe_trailing"), 25)
    pe_s = _clamp((30 - pe) / 20 * 100, 20, 80) if pe > 0 else 50
    mcap = _f(fund.get("market_cap"), 0)
    cap_s = 55 if mcap > 1e10 else 45
    beta = _f(fund.get("beta"), 1)
    beta_s = 60 if beta < 1.2 else 45
    return _clamp(0.5 * pe_s + 0.25 * cap_s + 0.25 * beta_s, 0, 100)


def _valuation_score(fund: Dict[str, Any], tech: Dict[str, Any]) -> float:
    pe = _f(fund.get("pe_trailing"), 22)
    val = _clamp((28 - pe) / 18 * 100, 15, 85)
    pos = _f(tech.get("range_position_52w"), 0.5)
    range_val = _clamp((0.7 - pos) * 120, 20, 80)
    return _clamp(0.6 * val + 0.4 * range_val, 0, 100)


def _sentiment_score(headlines: List[str]) -> float:
    if not headlines:
        return 50.0
    score = 0.0
    for h in headlines[:8]:
        low = h.lower()
        score += sum(1 for w in POS_WORDS if w in low)
        score -= sum(1 for w in NEG_WORDS if w in low)
    return _clamp(50 + score * 8, 0, 100)


def _signal_from_composite(c: float) -> Signal:
    if c >= 75:
        return "Buy"
    if c >= 62:
        return "Accumulate"
    if c >= 45:
        return "Hold"
    if c >= 30:
        return "Reduce"
    return "Exit"


def analyze_symbol(
    symbol: str,
    market: str = "IN",
    horizon: Horizon = "medium",
    position_context: Optional[Dict[str, Any]] = None,
    enrichment: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    en = enrichment or fetch_symbol_enrichment(symbol.replace(".NS", "").replace(".BO", ""))
    fund = en.get("fundamentals") or {}
    tech = en.get("technical") or {}
    headlines = en.get("news_headlines") or []

    sub = {
        "technical": round(_technical_score(tech), 1),
        "fundamental": round(_fundamental_score(fund), 1),
        "valuation": round(_valuation_score(fund, tech), 1),
        "earnings": 55.0,
        "sentiment": round(_sentiment_score(headlines), 1),
    }
    w = HORIZON_WEIGHTS.get(horizon, HORIZON_WEIGHTS["medium"])
    composite = sum(sub[k] * w[k] for k in w) / sum(w.values())
    signal: Signal = _signal_from_composite(composite)

    if position_context:
        wt = _f(position_context.get("weight_pct"))
        if wt > 35 and signal in ("Buy", "Accumulate"):
            signal = "Reduce"
        elif wt > 25 and signal == "Buy":
            signal = "Hold"

    scores = list(sub.values())
    dispersion = max(scores) - min(scores)
    confidence = _clamp(55 + (composite - 50) * 0.5 - dispersion * 0.2, 15, 95)

    steps = []
    if sub["valuation"] > 60:
        steps.append({"order": 1, "pillar": "valuation", "finding": f"P/E {_f(fund.get('pe_trailing')):.1f} — relatively attractive vs typical range.", "impact": "bullish", "evidence": {"pe_trailing": fund.get("pe_trailing")}})
    if tech.get("rsi14"):
        steps.append({"order": 2, "pillar": "technical", "finding": f"RSI(14)≈{tech.get('rsi14'):.0f}.", "impact": "neutral", "evidence": {"rsi14": tech.get("rsi14")}})
    if headlines:
        steps.append({"order": 3, "pillar": "sentiment", "finding": f"{len(headlines)} recent headlines; sentiment score {sub['sentiment']:.0f}.", "impact": "bullish" if sub["sentiment"] > 55 else "bearish", "evidence": {"headlines": headlines[:3]}})

    return {
        "symbol": symbol,
        "yahoo_symbol": en.get("yahoo_symbol"),
        "market": market,
        "currency": (en.get("quote") or {}).get("currency") or ("INR" if market == "IN" else "USD"),
        "signal": signal,
        "confidence_score": round(confidence, 1),
        "horizon": horizon,
        "composite_score": round(composite, 1),
        "sub_scores": sub,
        "reasoning_chain": {
            "steps": steps,
            "summary": f"{signal} — composite {composite:.0f}/100.",
            "contradictions": [],
        },
        "enrichment": en,
        "disclaimer": "Not investment advice. Data may be delayed.",
    }


def analyze_portfolio(
    stock_payload: Dict[str, Any],
    horizon: Horizon = "medium",
    refresh_enrichment: bool = False,
) -> Dict[str, Any]:
    holdings = stock_payload.get("holdings") or []
    enrichment = stock_payload.get("enrichment") or {}
    computed = stock_payload.get("computed") or {}
    allocation = computed.get("allocation_by_symbol") or []

    if refresh_enrichment or not enrichment:
        from services.stock_market_data import enrich_symbols_parallel
        syms = [h.get("symbol") for h in holdings if h.get("symbol")]
        enrichment = enrich_symbols_parallel(syms)

    weight_map = {a.get("name"): _f(a.get("pct")) for a in allocation}
    signals: List[Dict[str, Any]] = []
    counts: Dict[str, int] = {s: 0 for s in ["Buy", "Accumulate", "Hold", "Reduce", "Exit"]}

    for h in holdings:
        sym = h.get("symbol") or ""
        if not sym:
            continue
        pos = {
            "qty": h.get("qty"),
            "weight_pct": weight_map.get(sym),
            "invested_value": h.get("invested_value"),
            "current_value": h.get("current_value"),
            "pnl_pct": h.get("pnl_pct"),
        }
        sig = analyze_symbol(sym, "IN", horizon, pos, enrichment.get(sym))
        signals.append(sig)
        counts[sig["signal"]] = counts.get(sig["signal"], 0) + 1

    signals.sort(key=lambda x: x["confidence_score"], reverse=True)
    avg_conf = sum(s["confidence_score"] for s in signals) / max(len(signals), 1)

    return {
        "portfolio_summary": {
            "holdings_count": len(signals),
            "signals": counts,
            "avg_confidence": round(avg_conf, 1),
            "top_actions": [
                {"symbol": s["symbol"], "signal": s["signal"], "confidence_score": s["confidence_score"], "reason": s["reasoning_chain"]["summary"]}
                for s in signals[:3]
            ],
        },
        "signals": signals,
        "disclaimer": "Not investment advice.",
    }
