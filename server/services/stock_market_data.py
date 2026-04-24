"""
Free market data via yfinance (Yahoo Finance) for NSE/BSE Indian listings.
"""
from __future__ import annotations

import logging
import socket
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _rsi_closes(closes: List[float], period: int = 14) -> Optional[float]:
    """Simple RSI from closing prices (rolling mean of gains/losses, last window)."""
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(d, 0.0) for d in deltas]
    losses = [max(-d, 0.0) for d in deltas]
    if len(gains) < period:
        return None
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss < 1e-12:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _sma_closes(closes: List[float], window: int) -> Optional[float]:
    if len(closes) < window:
        return None
    return sum(closes[-window:]) / window


def yahoo_ticker_candidates(normalized_symbol: str) -> List[str]:
    s = normalized_symbol.upper().strip()
    if not s:
        return []
    # Prefer NSE for Indian equities
    return [f"{s}.NS", f"{s}.BO"]


def fetch_symbol_enrichment(normalized_symbol: str) -> Dict[str, Any]:
    """
    Returns quote, fundamentals snippet, technicals, news — best effort per symbol.
    """
    _prev_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(25)
    except Exception:
        pass
    try:
        return _fetch_symbol_enrichment_body(normalized_symbol)
    finally:
        try:
            socket.setdefaulttimeout(_prev_timeout)
        except Exception:
            pass


def _price_from_fast_info(ticker: Any) -> Optional[float]:
    try:
        fi = ticker.fast_info
        for k in ("lastPrice", "previousClose", "regularMarketPreviousClose"):
            v = fi.get(k)
            if v is not None and isinstance(v, (int, float)):
                return float(v)
    except Exception:
        pass
    return None


def _fetch_symbol_enrichment_body(normalized_symbol: str) -> Dict[str, Any]:
    try:
        import yfinance as yf
    except ImportError:
        return {
            "error": "yfinance not installed",
            "symbol": normalized_symbol,
        }

    out: Dict[str, Any] = {
        "symbol": normalized_symbol,
        "yahoo_symbol": None,
        "quote": {},
        "fundamentals": {},
        "technical": {},
        "news_headlines": [],
    }

    ticker_obj = None
    used = None
    last_err: Optional[str] = None

    for attempt in range(2):
        for cand in yahoo_ticker_candidates(normalized_symbol):
            try:
                t = yf.Ticker(cand)
                info = t.info or {}
                price = (
                    info.get("regularMarketPrice")
                    or info.get("currentPrice")
                    or info.get("previousClose")
                )
                if not price:
                    price = _price_from_fast_info(t)
                if price is not None:
                    ticker_obj = t
                    used = cand
                    break
                last_err = "empty quote (Yahoo throttled or symbol not found)"
            except Exception as e:
                last_err = str(e)
                logger.debug("yfinance try %s: %s", cand, e)
        if ticker_obj is not None:
            break
        time.sleep(0.6)

    if ticker_obj is None or used is None:
        used = yahoo_ticker_candidates(normalized_symbol)[0]
        try:
            ticker_obj = yf.Ticker(used)
        except Exception as e:
            return {**out, "error": str(e), "yahoo_symbol": used}

    out["yahoo_symbol"] = used

    try:
        info = ticker_obj.info or {}
    except Exception as e:
        info = {}
        out["info_error"] = str(e)

    cur = (
        info.get("regularMarketPrice")
        or info.get("currentPrice")
        or info.get("previousClose")
    )
    if cur is None:
        cur = _price_from_fast_info(ticker_obj)
    if cur is None and last_err:
        out["quote_warning"] = last_err

    out["quote"] = {
        "currency": info.get("currency"),
        "regular_market_price": cur,
        "previous_close": info.get("previousClose"),
        "day_high": info.get("dayHigh"),
        "day_low": info.get("dayLow"),
        "volume": info.get("volume"),
    }

    pe = info.get("trailingPE") or info.get("forwardPE")
    mcap = info.get("marketCap")

    out["fundamentals"] = {
        "short_name": info.get("shortName") or info.get("longName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": mcap,
        "pe_trailing": pe,
        "eps_ttm": info.get("trailingEps"),
        "beta": info.get("beta"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "avg_volume": info.get("averageVolume"),
    }

    # Technicals from 6mo history
    tech: Dict[str, Any] = {}
    try:
        hist = ticker_obj.history(period="6mo", interval="1d")
        if hist is not None and len(hist) > 0:
            raw = hist["Close"].dropna()
            closes = [float(x) for x in raw.tolist()]
            tech["rsi14"] = _rsi_closes(closes, 14)
            tech["sma20"] = _sma_closes(closes, 20)
            tech["sma50"] = _sma_closes(closes, 50)
            lo = info.get("fiftyTwoWeekLow")
            hi = info.get("fiftyTwoWeekHigh")
            last = float(closes[-1]) if closes else None
            if last and hi and lo and hi > lo:
                pos = (last - lo) / (hi - lo)
                tech["range_position_52w"] = round(pos, 4)
                if pos >= 0.85:
                    tech["range_label"] = "near_52w_high"
                elif pos <= 0.15:
                    tech["range_label"] = "near_52w_low"
                else:
                    tech["range_label"] = "mid_range"
            tech["last_close"] = last
    except Exception as e:
        tech["history_error"] = str(e)

    out["technical"] = tech

    headlines: List[str] = []
    try:
        news = ticker_obj.news or []
        for item in news[:8]:
            title = item.get("title")
            if title:
                headlines.append(str(title))
    except Exception:
        pass
    out["news_headlines"] = headlines

    return out


def build_manual_redistribution_hints(
    allocation: List[Dict[str, Any]],
    enrichment_by_symbol: Dict[str, Dict[str, Any]],
    target_single_name_pct: float = 20.0,
    target_top3_pct: float = 60.0,
) -> Dict[str, Any]:
    """
    Rule-based hints for trimming concentration and sector balance (not financial advice).
    """
    alerts: List[Dict[str, Any]] = []
    trim_suggestions: List[Dict[str, Any]] = []
    sector_weights: Dict[str, float] = {}

    for row in allocation:
        name = row.get("name") or ""
        pct = float(row.get("pct") or 0)
        en = enrichment_by_symbol.get(name) or {}
        sec = (en.get("fundamentals") or {}).get("sector") or "Unknown"
        sector_weights[sec] = sector_weights.get(sec, 0.0) + pct

        if pct > target_single_name_pct:
            trim_to = target_single_name_pct
            excess_pct = pct - trim_to
            alerts.append(
                {
                    "type": "concentration",
                    "symbol": name,
                    "message": f"Position ~{pct:.1f}% of equity book — consider trimming toward ~{trim_to:.0f}% unless thesis is high conviction.",
                    "severity": "high" if pct > 35 else "medium",
                }
            )
            trim_suggestions.append(
                {
                    "symbol": name,
                    "current_weight_pct": round(pct, 2),
                    "suggested_target_pct": trim_to,
                    "approx_trim_notional_pct_of_portfolio": round(excess_pct, 2),
                }
            )

    top3 = sum(float(a.get("pct") or 0) for a in allocation[:3])
    if top3 > target_top3_pct:
        alerts.append(
            {
                "type": "top3",
                "message": f"Top 3 names ≈ {top3:.1f}% of portfolio — diversification may be limited.",
                "severity": "medium",
            }
        )

    sorted_sectors = sorted(sector_weights.items(), key=lambda x: -x[1])
    if sorted_sectors:
        top_sec, top_w = sorted_sectors[0]
        known = {k: v for k, v in sector_weights.items() if k and k != "Unknown"}
        if known and top_sec != "Unknown" and top_w > 50:
            alerts.append(
                {
                    "type": "sector",
                    "message": f"Largest sector ({top_sec}) ≈ {top_w:.1f}% — review sector bets vs goals.",
                    "severity": "medium",
                }
            )

    # Technical overlays
    for row in allocation[:15]:
        sym = row.get("name") or ""
        en = enrichment_by_symbol.get(sym) or {}
        if en.get("error"):
            continue
        tech = en.get("technical") or {}
        rsi = tech.get("rsi14")
        label = tech.get("range_label")
        if rsi is not None:
            if rsi >= 72:
                alerts.append(
                    {
                        "type": "technical",
                        "symbol": sym,
                        "message": f"RSI(14)≈{rsi:.0f} (elevated) — momentum stretched; revisit sizing vs fundamentals.",
                        "severity": "low",
                    }
                )
            elif rsi <= 28:
                alerts.append(
                    {
                        "type": "technical",
                        "symbol": sym,
                        "message": f"RSI(14)≈{rsi:.0f} (weak) — check if drawdown is opportunity or deterioration.",
                        "severity": "low",
                    }
                )
        if label == "near_52w_high":
            alerts.append(
                {
                    "type": "technical",
                    "symbol": sym,
                    "message": "Price near 52-week high — consider taking partial profits if goals met.",
                    "severity": "low",
                }
            )

    return {
        "alerts": alerts[:25],
        "trim_suggestions": trim_suggestions,
        "sector_weights_pct": [
            {"sector": k, "weight_pct": round(v, 2)} for k, v in sorted_sectors
        ],
        "disclaimer": "Heuristic hints only — not investment advice. Verify data and consult a SEBI-registered advisor if needed.",
    }


def enrich_portfolio(symbols: List[str]) -> Dict[str, Any]:
    by_symbol: Dict[str, Any] = {}
    for sym in symbols:
        by_symbol[sym] = fetch_symbol_enrichment(sym)
    return by_symbol


def enrich_symbols_parallel(
    symbols: List[str],
    *,
    max_workers: int = 4,
    per_future_timeout_sec: float = 45.0,
    overall_timeout_sec: float = 180.0,
) -> Dict[str, Any]:
    """
    Fetch Yahoo data for many symbols concurrently (bounded workers).
    overall_timeout_sec caps total wait so the HTTP handler cannot hang indefinitely.
    """
    if not symbols:
        return {}

    def safe_fetch(sym: str) -> Dict[str, Any]:
        try:
            return fetch_symbol_enrichment(sym)
        except Exception as e:
            logger.warning("enrich failed for %s: %s", sym, e)
            return {"symbol": sym, "error": str(e)}

    workers = max(1, min(max_workers, len(symbols)))
    out: Dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(safe_fetch, s): s for s in symbols}
        try:
            for fut in as_completed(futures, timeout=overall_timeout_sec):
                sym = futures[fut]
                try:
                    out[sym] = fut.result(timeout=per_future_timeout_sec)
                except Exception as e:
                    out[sym] = {"symbol": sym, "error": f"timeout or error: {e}"}
        except TimeoutError:
            logger.warning(
                "enrich batch hit overall timeout (%ss); marking pending symbols.",
                overall_timeout_sec,
            )
            for fut, sym in futures.items():
                if sym not in out:
                    out[sym] = {
                        "symbol": sym,
                        "error": "Yahoo Finance batch timed out — retry or check symbol.",
                    }
    return out
