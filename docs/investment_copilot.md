# Investment Copilot — Service Architecture

An advisory layer on top of the existing **Stock Market Analysis** engine. It produces per-symbol recommendations with confidence scores and structured reasoning chains — grounded in market data, not free-form LLM guesses.

> **Disclaimer design:** All outputs are illustrative research aids, not SEBI-registered investment advice.

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Relationship to existing stock engine](#2-relationship-to-existing-stock-engine)
3. [Service architecture](#3-service-architecture)
4. [Analysis pipelines](#4-analysis-pipelines)
5. [Signal synthesis and reasoning chains](#5-signal-synthesis-and-reasoning-chains)
6. [API specification](#6-api-specification)
7. [Data models](#7-data-models)
8. [Client integration](#8-client-integration)
9. [Extensibility and phases](#9-extensibility-and-phases)

---

## 1. Purpose and scope

### Responsibilities

| Domain | Coverage |
|--------|----------|
| Indian stocks | NSE/BSE via Yahoo (`.NS`, `.BO`) — same as today |
| US stocks | NYSE/NASDAQ via Yahoo (plain ticker, e.g. `AAPL`) |
| Technical indicators | RSI, SMA, EMA, MACD, 52w range, volume trend |
| Fundamental indicators | Revenue growth, margins, ROE, debt/equity, earnings quality |
| Valuation metrics | P/E, forward P/E, P/B, PEG, EV/EBITDA vs sector median |
| Earnings reports | Last 4–8 quarters trend, YoY/QoQ, surprise direction |
| News sentiment | Headline polarity + relevance score |

### Outputs (per symbol)

| Signal | Meaning |
|--------|---------|
| **Buy** | New position or add from zero; thesis strong, risk acceptable |
| **Accumulate** | Existing or building position; add on dips / SIP-style |
| **Hold** | Maintain weight; no action required |
| **Reduce** | Trim overweight; take partial profits or de-risk |
| **Exit** | Close position; thesis broken or risk unacceptable |

Each signal includes:

- `confidence_score` — 0–100
- `reasoning_chain` — ordered list of evidence steps (auditable)
- `sub_scores` — technical, fundamental, valuation, earnings, sentiment (each 0–100)
- `horizon` — `short` (weeks), `medium` (months), `long` (years)

---

## 2. Relationship to existing stock engine

### What exists today

| Component | Location | Role |
|-----------|----------|------|
| Holdings parser | `server/services/stock_holdings_parser.py` | Excel → portfolio JSON |
| Market enrichment | `server/services/stock_market_data.py` | yfinance: quote, fundamentals snippet, RSI/SMA, news |
| Parallel enrich | `enrich_symbols_parallel()` | Batch fetch per symbol |
| Manual hints | `build_manual_redistribution_hints()` | Rule-based concentration / RSI alerts |
| Portfolio AI | `server/services/analyze_stock_ai.py` | `AIMStockAnalyzer` — narrative report |
| Endpoints | `server/main.py` | `/upload-stock-holdings-excel`, `/enrich-stock-portfolio`, `/analyze-stock-ai`, `/ask-stock-ai` |

### What Investment Copilot adds

```
Existing                          Investment Copilot (new)
────────                          ────────────────────────
fetch_symbol_enrichment()    ──►   Extended enrichment (US, more fields)
build_manual_redistribution_hints  Deterministic signal per symbol
AIMStockAnalyzer (portfolio) ──►   Symbol-level signals + reasoning chains
                                   SignalSynthesizer (rules + optional LLM polish)
```

**Principle:** Copilot **owns the signal math**. `AIMStockAnalyzer` may summarize Copilot output in portfolio reports but must not invent Buy/Hold/Exit labels without Copilot payload.

### Integration flow

```
User uploads holdings Excel
  → POST /upload-stock-holdings-excel
  → POST /enrich-stock-portfolio          (existing)
  → POST /copilot/analyze-portfolio       (new — full signals)
  → UI: Copilot tab (signals table + reasoning drill-down)
  → (optional) POST /analyze-stock-ai     (AI narrative over copilot payload)
```

---

## 3. Service architecture

### Component diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Client: Stock Analyzer UI                        │
│  Holdings │ Manual │ AI │ Copilot (signals + reasoning chains)          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTP
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    server/services/investment_copilot/                     │
│                                                                          │
│  ┌──────────────────┐                                                   │
│  │ CopilotOrchestrator │◄─── entry: analyze_symbol / analyze_portfolio  │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│     ┌─────┴─────┬─────────────┬──────────────┬───────────────┐        │
│     ▼           ▼             ▼              ▼               ▼        │
│  MarketData  Technical   Fundamental   Valuation      Earnings         │
│  Provider    Analyzer    Analyzer      Analyzer       Analyzer         │
│     │           │             │              │               │        │
│     └───────────┴─────────────┴──────────────┴───────────────┘        │
│                              │                                           │
│                    ┌─────────┴─────────┐                                │
│                    ▼                   ▼                                │
│             SentimentAnalyzer   SignalSynthesizer                        │
│             (news)              (weights → signal)                       │
│                    │                   │                                │
│                    └─────────┬─────────┘                                │
│                              ▼                                           │
│                    ReasoningChainBuilder                                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ reuses
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              server/services/stock_market_data.py (extended)             │
│  fetch_symbol_enrichment │ enrich_symbols_parallel │ yahoo_ticker_*      │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                         Yahoo Finance (yfinance)
```

### Module layout

| File | Responsibility |
|------|----------------|
| `investment_copilot/__init__.py` | Public exports |
| `investment_copilot/orchestrator.py` | `CopilotOrchestrator` — coordinates pipeline |
| `investment_copilot/market_data.py` | `MarketDataProvider` — extends `stock_market_data` for IN/US |
| `investment_copilot/technical.py` | `TechnicalAnalyzer` — indicators + technical sub-score |
| `investment_copilot/fundamental.py` | `FundamentalAnalyzer` — quality/growth sub-score |
| `investment_copilot/valuation.py` | `ValuationAnalyzer` — relative & absolute valuation sub-score |
| `investment_copilot/earnings.py` | `EarningsAnalyzer` — quarterly trends + surprise sub-score |
| `investment_copilot/sentiment.py` | `SentimentAnalyzer` — headline scoring |
| `investment_copilot/synthesizer.py` | `SignalSynthesizer` — weighted signal + confidence |
| `investment_copilot/reasoning.py` | `ReasoningChainBuilder` — human-readable evidence chain |
| `investment_copilot/models.py` | Pydantic/dataclass contracts |
| `investment_copilot/config.py` | Weights, thresholds, market presets |
| `analyze_copilot_ai.py` | Optional LLM: polish reasoning prose (never changes signal) |

### Orchestrator contract

```python
class CopilotOrchestrator:
    def analyze_symbol(
        self,
        symbol: str,
        market: Literal["IN", "US"],
        position_context: Optional[PositionContext] = None,
    ) -> CopilotSignalResult: ...

    def analyze_portfolio(
        self,
        stock_payload: dict,
        markets: Optional[dict[str, Literal["IN", "US"]]] = None,
    ) -> CopilotPortfolioResult: ...
```

---

## 4. Analysis pipelines

### 4.1 Market resolution (India vs US)

```
input: symbol, market_hint?

if market_hint == "US":
  candidates = [symbol.upper()]                    # AAPL, MSFT
elif market_hint == "IN" or default:
  candidates = [f"{symbol}.NS", f"{symbol}.BO"]    # existing logic

resolve first candidate with valid quote
emit: yahoo_symbol, market, currency
```

Auto-detect: if symbol contains `.` or user selects exchange; holdings Excel may add `market` column (v2).

### 4.2 Technical indicators

Extends existing `technical` block in `fetch_symbol_enrichment`.

| Indicator | Calculation | Signal bias |
|-----------|-------------|-------------|
| RSI(14) | Existing `_rsi_closes` | <30 bullish lean; >70 bearish lean |
| SMA(20), SMA(50) | Existing | Golden cross (SMA20 > SMA50) bullish |
| EMA(12), EMA(26) | New | Trend direction |
| MACD | EMA12 − EMA26, signal line | Crossover momentum |
| 52w range position | Existing `range_position_52w` | Extremes → Reduce/Accumulate context |
| Volume vs avg | `volume / avg_volume` | Confirms breakouts |

**Technical sub-score (0–100):**

```
tech_score = clamp(
  0.25 × rsi_score +
  0.25 × trend_score +      // SMA20 vs SMA50, price vs SMA50
  0.20 × macd_score +
  0.15 × range_score +      // favorable entry vs chasing highs
  0.15 × volume_score,
  0, 100
)
```

Each component maps to −1..+1 bias then scaled to 0–100.

### 4.3 Fundamental indicators

Pulled from `ticker.info` + quarterly financials (`ticker.quarterly_financials`, `ticker.quarterly_income_stmt`).

| Metric | Source | Healthy band (configurable) |
|--------|--------|---------------------------|
| Revenue YoY growth | Quarterly revenue | >8% positive |
| Operating margin trend | Quarterly op income / revenue | Stable or improving |
| ROE | `returnOnEquity` | >12% |
| Debt/equity | `debtToEquity` | <1.0 (sector-adjusted) |
| Current ratio | `currentRatio` | >1.2 |
| Earnings quality | Accruals proxy / FCF vs net income | FCF positive |

**Fundamental sub-score:**

```
fund_score = weighted average of metric z-scores vs sector defaults
```

Missing data reduces weight; if <40% metrics present, cap `fund_score` confidence contribution.

### 4.4 Valuation metrics

| Metric | Formula / source | Interpretation |
|--------|------------------|----------------|
| Trailing P/E | `trailingPE` | vs sector median |
| Forward P/E | `forwardPE` | growth-adjusted |
| P/B | `priceToBook` | asset-heavy sectors |
| PEG | `PE / earnings_growth_pct` | <1.2 attractive |
| EV/EBITDA | `enterpriseToEbitda` | vs sector |
| Price vs 52w range | existing | not overextended |

**Valuation sub-score (0–100):** higher = more attractive (cheaper vs growth).

```
val_score = clamp(
  0.35 × pe_relative_score +
  0.25 × peg_score +
  0.20 × ev_ebitda_relative +
  0.20 × range_valuation_score,
  0, 100
)

pe_relative_score = f(pe / sector_median_pe)   // <0.85 → high score
```

Sector medians: static config table in `config.py` (v1); external API later.

### 4.5 Earnings reports

```
quarterly = last 8 quarters EPS / revenue
earnings_trend = slope(EPS over 4Q)
revenue_trend = slope(revenue over 4Q)
latest_surprise = (actual_eps - estimate_eps) / |estimate_eps|   // if available

earnings_score components:
  - growth: EPS YoY > 0 → +bias
  - acceleration: 2nd derivative positive → +bias
  - surprise: positive surprise → +bias
  - miss streak: 2+ consecutive misses → −bias
```

**Earnings sub-score (0–100)** from normalized components.

### 4.6 News sentiment

**v1 (deterministic):** rule-based keyword scoring on headlines from `ticker.news`.

```
for each headline:
  polarity = score_positive_keywords - score_negative_keywords
  relevance = 1.0 if symbol name in title else 0.6

sentiment_score = clamp(50 + 10 × weighted_avg(polarity), 0, 100)
```

Keyword lists: `beat`, `upgrade`, `record`, `growth` (+); `downgrade`, `fraud`, `probe`, `miss`, `cut` (−).

**v2 (optional):** `SentimentAnalyzer` calls small LLM batch on headlines — output polarity only; signal still from `SignalSynthesizer`.

---

## 5. Signal synthesis and reasoning chains

### 5.1 Composite score

```
composite = (
  w_tech × tech_score +
  w_fund × fund_score +
  w_val  × val_score +
  w_earn × earnings_score +
  w_sent × sentiment_score
) / (w_tech + w_fund + w_val + w_earn + w_sent)
```

**Default weights:**

| Pillar | Weight | Rationale |
|--------|--------|-----------|
| Technical | 0.20 | Timing and momentum |
| Fundamental | 0.25 | Business quality |
| Valuation | 0.25 | Price paid |
| Earnings | 0.20 | Recent trajectory |
| Sentiment | 0.10 | Short-term noise filter |

Weights shift by `horizon`:

| Horizon | Technical | Fundamental | Valuation | Earnings | Sentiment |
|---------|-----------|-------------|-----------|----------|-----------|
| short | 0.35 | 0.15 | 0.15 | 0.15 | 0.20 |
| medium | 0.20 | 0.25 | 0.25 | 0.20 | 0.10 |
| long | 0.10 | 0.30 | 0.30 | 0.25 | 0.05 |

### 5.2 Signal mapping

Map `composite` (0–100) to discrete signal:

| Composite | Signal |
|-----------|--------|
| 75–100 | **Buy** |
| 62–74 | **Accumulate** |
| 45–61 | **Hold** |
| 30–44 | **Reduce** |
| 0–29 | **Exit** |

### 5.3 Position-aware overrides

When `position_context` is provided (from holdings):

| Condition | Override |
|-----------|----------|
| Weight > 25% of portfolio + signal Buy/Accumulate | Cap at **Hold**; add reasoning step |
| Weight > 35% | Force **Reduce** unless composite > 85 |
| PnL < −25% + fund_score < 40 | Lean **Reduce** / **Exit** |
| PnL > +60% + tech_score < 40 (overbought) | Lean **Reduce** |
| No position + composite 62–74 | **Buy** instead of Accumulate |

### 5.4 Confidence score

```
data_coverage = fraction of pillars with sufficient data (0–1)
pillar_dispersion = std(sub_scores)                // high disagreement → lower confidence
edge_strength = |composite - 50| / 50             // stronger conviction

confidence = clamp(
  100 × (
    0.40 × data_coverage +
    0.35 × edge_strength +
    0.25 × (1 - pillar_dispersion / 50)
  ),
  15, 95
)
```

Floor 15% — never claim absolute certainty. Cap 95% — residual model risk.

### 5.5 Reasoning chain structure

Ordered evidence list — each step is auditable and maps to a pillar.

```json
{
  "steps": [
    {
      "order": 1,
      "pillar": "valuation",
      "finding": "Trailing P/E 18.2 vs sector median 24.1 — trading at discount.",
      "impact": "bullish",
      "weight": 0.25,
      "evidence": { "pe_trailing": 18.2, "sector_median_pe": 24.1 }
    },
    {
      "order": 2,
      "pillar": "technical",
      "finding": "RSI(14) at 68 — momentum strong but approaching overbought.",
      "impact": "neutral",
      "weight": 0.20,
      "evidence": { "rsi14": 68 }
    },
    {
      "order": 3,
      "pillar": "earnings",
      "finding": "EPS grew YoY for 3 consecutive quarters.",
      "impact": "bullish",
      "weight": 0.20,
      "evidence": { "eps_yoy_quarters_positive": 3 }
    },
    {
      "order": 4,
      "pillar": "sentiment",
      "finding": "Recent headlines skew positive (2 upgrades, 0 downgrades).",
      "impact": "bullish",
      "weight": 0.10,
      "evidence": { "sentiment_score": 62 }
    },
    {
      "order": 5,
      "pillar": "portfolio",
      "finding": "Position is 8.2% of equity book — size within limits.",
      "impact": "neutral",
      "weight": null,
      "evidence": { "weight_pct": 8.2 }
    }
  ],
  "summary": "Accumulate — quality name at reasonable valuation; momentum elevated.",
  "contradictions": [
    "Technical momentum high while valuation attractive — watch for pullback entry."
  ]
}
```

**Builder algorithm:**

```
1. Sort pillar contributions by |contribution_to_composite|
2. Emit top 5–8 steps with impact = bullish | bearish | neutral
3. Append position_context step if present
4. Detect contradictions: any pair (tech bullish + val bearish) or (sentiment bearish + fund bullish)
5. summary = template(signal, top 2 findings)
```

---

## 6. API specification

All endpoints under FastAPI `main.py`. Stateless — client sends symbol or full `stock_payload`.

### 6.1 `POST /copilot/analyze-symbol`

Deep dive on a single ticker.

**Request**

```json
{
  "symbol": "RELIANCE",
  "market": "IN",
  "horizon": "medium",
  "position_context": {
    "qty": 10,
    "weight_pct": 8.2,
    "invested_value": 250000,
    "current_value": 285000,
    "pnl_pct": 14.0
  }
}
```

**Response**

```json
{
  "symbol": "RELIANCE",
  "yahoo_symbol": "RELIANCE.NS",
  "market": "IN",
  "currency": "INR",
  "signal": "Accumulate",
  "confidence_score": 71,
  "horizon": "medium",
  "composite_score": 68.4,
  "sub_scores": {
    "technical": 72,
    "fundamental": 65,
    "valuation": 74,
    "earnings": 66,
    "sentiment": 58
  },
  "reasoning_chain": { "steps": [], "summary": "", "contradictions": [] },
  "enrichment": { "quote": {}, "fundamentals": {}, "technical": {} },
  "disclaimer": "Not investment advice. Data may be delayed.",
  "computed_at": "2026-06-10T12:00:00Z"
}
```

---

### 6.2 `POST /copilot/analyze-portfolio`

Analyze all holdings in an uploaded portfolio. Reuses enrichment cache when provided.

**Request**

```json
{
  "stock_payload": {
    "summary": {},
    "holdings": [],
    "computed": {},
    "enrichment": {}
  },
  "horizon": "medium",
  "refresh_enrichment": false
}
```

If `refresh_enrichment: true`, orchestrator calls `enrich_symbols_parallel` before analysis.

**Response**

```json
{
  "portfolio_summary": {
    "holdings_count": 12,
    "signals": { "Buy": 1, "Accumulate": 4, "Hold": 5, "Reduce": 2, "Exit": 0 },
    "avg_confidence": 64,
    "top_actions": [
      { "symbol": "XYZ", "signal": "Reduce", "confidence_score": 78, "reason": "Concentration + overbought" }
    ]
  },
  "signals": [
    { "symbol": "RELIANCE", "signal": "Accumulate", "confidence_score": 71, "..." : "..." }
  ],
  "disclaimer": "..."
}
```

---

### 6.3 `POST /copilot/batch-signals`

Lightweight signals without full reasoning (faster refresh).

**Request**

```json
{
  "symbols": [
    { "symbol": "TCS", "market": "IN" },
    { "symbol": "AAPL", "market": "US" }
  ],
  "horizon": "short"
}
```

**Response**

```json
{
  "signals": [
    { "symbol": "TCS", "signal": "Hold", "confidence_score": 55, "composite_score": 52.1 },
    { "symbol": "AAPL", "signal": "Accumulate", "confidence_score": 68, "composite_score": 65.0 }
  ]
}
```

---

### 6.4 `POST /copilot/ask`

Contextual Q&A over Copilot results (optional LLM).

**Request**

```json
{
  "copilot_payload": {},
  "question": "Why is INFY Reduce while TCS is Hold?",
  "history": []
}
```

**Guardrail:** LLM must cite `reasoning_chain` steps only; no new signals.

---

### 6.5 `POST /analyze-stock-ai` (existing — updated contract)

Portfolio AI report should receive `copilot_payload` embedded in `stock_payload`:

```json
{
  "stock_payload": {
    "summary": {},
    "holdings": [],
    "computed": {},
    "enrichment": {},
    "copilot": { "signals": [], "portfolio_summary": {} }
  }
}
```

`AIMStockAnalyzer` references Copilot signals in redistribution plan — does not recompute them.

---

### Error handling

| Code | Condition |
|------|-----------|
| 400 | Invalid symbol / market |
| 404 | Symbol not found on Yahoo |
| 422 | Malformed payload |
| 503 | Yahoo throttle / network (partial results with `errors[]` per symbol) |

Partial portfolio success: return signals for resolved symbols + `errors: [{ symbol, error }]`.

---

## 7. Data models

### Enums

```python
Signal = Literal["Buy", "Accumulate", "Hold", "Reduce", "Exit"]
Market = Literal["IN", "US"]
Horizon = Literal["short", "medium", "long"]
Impact = Literal["bullish", "bearish", "neutral"]
Pillar = Literal["technical", "fundamental", "valuation", "earnings", "sentiment", "portfolio"]
```

### Core types (Pydantic)

```python
class PositionContext(BaseModel):
    qty: Optional[float] = None
    weight_pct: Optional[float] = None
    invested_value: Optional[float] = None
    current_value: Optional[float] = None
    pnl_pct: Optional[float] = None

class SubScores(BaseModel):
    technical: float
    fundamental: float
    valuation: float
    earnings: float
    sentiment: float

class ReasoningStep(BaseModel):
    order: int
    pillar: Pillar
    finding: str
    impact: Impact
    weight: Optional[float] = None
    evidence: dict

class ReasoningChain(BaseModel):
    steps: List[ReasoningStep]
    summary: str
    contradictions: List[str]

class CopilotSignalResult(BaseModel):
    symbol: str
    yahoo_symbol: Optional[str]
    market: Market
    currency: Optional[str]
    signal: Signal
    confidence_score: float
    horizon: Horizon
    composite_score: float
    sub_scores: SubScores
    reasoning_chain: ReasoningChain
    enrichment: dict
    disclaimer: str
    computed_at: datetime
```

### Cache keys (v1 client)

| Key | Content |
|-----|---------|
| `stock-copilot-signals-v1` | Last portfolio Copilot response |
| `stock-enrichment` | Existing enrichment blob (reuse) |

---

## 8. Client integration

### Stock Analyzer UI

Add **Copilot** tab alongside Manual and AI:

| UI block | Data source |
|----------|-------------|
| Signal summary cards | `portfolio_summary.signals` counts |
| Holdings signal table | `signals[]` — sortable by confidence, signal |
| Reasoning drawer | `reasoning_chain` on row click |
| Horizon toggle | short / medium / long → re-fetch |
| Market badge | IN 🇮🇳 / US 🇺🇸 per row |

**Flow**

```
Upload Excel
  → enrich (if needed)
  → POST /copilot/analyze-portfolio
  → render table
User clicks symbol
  → reasoning drawer + sub-score radar chart
User switches to AI tab
  → POST /analyze-stock-ai with copilot embedded
```

### North Star Mode cross-link (optional)

Wealth Simulation **Scenario E** (aggressive investing) may display Copilot `Reduce`/`Exit` count as risk overlay on equity allocation.

---

## 9. Extensibility and phases

### Phase 1 — MVP

| Deliverable | Detail |
|-------------|--------|
| US + IN market resolution | Extend `yahoo_ticker_candidates` |
| Technical | Reuse RSI/SMA; add EMA/MACD |
| Fundamental + valuation | yfinance `info` fields |
| Earnings | Quarterly stmt trend (best effort) |
| Sentiment | Rule-based headlines |
| Signals + reasoning | `SignalSynthesizer` + `ReasoningChainBuilder` |
| APIs | `/copilot/analyze-symbol`, `/copilot/analyze-portfolio` |
| UI | Copilot tab in Stock Analyzer |

### Phase 2 — Depth

- Sector median tables (Nifty sector PE)
- DCF-lite valuation module
- Earnings call summary (LLM on transcript snippet)
- Watchlist without holdings upload

### Phase 3 — Quality

- Backtest signal accuracy (historical snapshots)
- User feedback loop (`signal_helpful: bool`)
- Alert webhooks: signal changed Hold → Reduce

### Phase 4 — Data sources

- BSE/NSE official feeds (licensed)
- US SEC EDGAR for 10-K/10-Q parsing
- Alternative data (insider trades, institutional flow)

---

## Related docs

- [`market_data_ingestion.md`](market_data_ingestion.md) — ETL, caching, and SQLite store that feeds Copilot pillars (prices, fundamentals, earnings, news, insider)

---

## Summary

| Layer | Role |
|-------|------|
| `stock_market_data.py` | Raw enrichment (extended for US + earnings); migrates to `MarketDataService` per ingestion doc |
| `investment_copilot/*` | Multi-pillar analysis → signal + confidence + reasoning |
| `analyze_copilot_ai.py` | Optional narrative; never overrides signal |
| Stock Analyzer UI | Copilot tab for actionable per-symbol guidance |
| `analyze_stock_ai.py` | Portfolio narrative grounded in Copilot output |

The Investment Copilot turns passive enrichment into **structured, explainable recommendations** — Buy through Exit — with confidence scores and auditable reasoning chains.
