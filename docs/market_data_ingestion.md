# Market Data Ingestion — North Star Mode

Low-cost ingestion architecture for **solo-developer** operation. Feeds North Star Mode (Wealth Engine, Simulation Engine), Investment Copilot, and the existing Stock Analyzer.

**Design goals:** $0–$20/month, minimal ops, reuse existing `yfinance` stack, upgrade paths without rewrites.

---

## Table of contents

1. [Scope and consumers](#1-scope-and-consumers)
2. [Data sources](#2-data-sources)
3. [Symbol registry](#3-symbol-registry)
4. [ETL pipelines](#4-etl-pipelines)
5. [Refresh schedules](#5-refresh-schedules)
6. [Caching strategy](#6-caching-strategy)
7. [Storage model](#7-storage-model)
8. [Service architecture](#8-service-architecture)
9. [Cost and scaling](#9-cost-and-scaling)
10. [Implementation phases](#10-implementation-phases)

---

## 1. Scope and consumers

### Markets and data domains

| Market | Exchanges | Price history | Fundamentals | Earnings | Corporate actions | News | Insider |
|--------|-----------|---------------|--------------|----------|-------------------|------|---------|
| India | NSE, BSE | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| US | NYSE, NASDAQ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Downstream consumers

```
Market Data Store
  ├── North Star Wealth Engine      (portfolio marks, blended returns)
  ├── Wealth Simulation Engine    (Scenario E/F return assumptions)
  ├── Investment Copilot            (technical, fundamental, sentiment pillars)
  └── Stock Analyzer (existing)     (enrichment on upload / watchlist)
```

### v0 today vs target

| Capability | Today (`stock_market_data.py`) | Target |
|------------|-------------------------------|--------|
| Indian quotes | yfinance `.NS` / `.BO` | Same + NSE bhavcopy validation |
| US quotes | Not implemented | yfinance plain ticker |
| Price history | 6mo on-demand | 10Y EOD in local store |
| Fundamentals | `ticker.info` snippet | Snapshot table + history |
| Earnings | None persisted | Quarterly series |
| Corporate actions | None | splits, dividends, bonuses |
| News | Headlines only, ephemeral | Stored + TTL |
| Insider | None | SEC Form 4 (US); SAST (IN) |

---

## 2. Data sources

Tiered by cost. **Use Tier 0 until quality or rate limits force an upgrade.**

### Tier 0 — Free (primary for solo dev)

| Domain | India (NSE/BSE) | US (NYSE/NASDAQ) | Notes |
|--------|-----------------|------------------|-------|
| **Price history** | [yfinance](https://github.com/ranaroussi/yfinance) `RELIANCE.NS`, `RELIANCE.BO` | yfinance `AAPL` | Already in repo; unofficial Yahoo API |
| **EOD validation** | [NSE bhavcopy](https://www.nseindia.com/all-reports) CSV (archived daily) | — | Corrects Yahoo gaps; manual download or scripted |
| **Fundamentals** | yfinance `info` + `financials` | yfinance + [SEC EDGAR](https://www.sec.gov/edgar/sec-api-documentation) `companyfacts` | EDGAR is authoritative for US |
| **Earnings** | yfinance `earnings_dates`, quarterly stmts | yfinance + EDGAR `10-Q`/`10-K` XBRL | Calendar from yfinance; filings from EDGAR |
| **Corporate actions** | yfinance `actions`; NSE corporate-actions CSV | yfinance `actions`; EDGAR | Splits/dividends reliable on Yahoo |
| **News** | yfinance `ticker.news` | yfinance `ticker.news` | 5–10 headlines; no full text |
| **Insider** | NSE/BSE SAST bulk deals (periodic scrape or CSV) | [SEC Form 4](https://www.sec.gov/cgi-bin/browse-edgar) via `edgartools` or RSS | US insider is excellent free data |

**Monthly cost:** $0

### Tier 1 — Free-tier APIs (backup / gap-fill)

| Provider | Free limit | Best for |
|----------|------------|----------|
| [Finnhub](https://finnhub.io) | 60 calls/min | US news, earnings calendar |
| [Alpha Vantage](https://www.alphavantage.co) | 25 calls/day | US daily OHLCV backup |
| [Financial Modeling Prep](https://site.financialmodelingprep.com) | 250 calls/day | US fundamentals snippet |

Use only as **fallback** when yfinance returns empty (throttling). Track daily quota in SQLite `api_quota` table.

**Monthly cost:** $0 (stay within limits)

### Tier 2 — Paid (defer until revenue or pain)

| Provider | ~Cost | When to adopt |
|----------|-------|---------------|
| Polygon.io | $29+/mo | Real-time US, reliable corporate actions |
| NSE official data feed | ₹₹₹ | Production SEBI-compliant Indian retail app |
| Refinitiv / Bloomberg | $$$$ | Never for solo side project |

**Recommendation:** Stay on Tier 0 + Tier 1 fallbacks through MVP and early users.

### Source selection matrix

```
                    ┌─────────────┐
  symbol request ──►│ Symbol      │──► resolve yahoo_ticker, exchange, currency
                    │ Registry    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   price_history      fundamentals        news
   yfinance (0)       yfinance (0)        yfinance (0)
   nse_bhavcopy (0)   sec_edgar (0) US    finnhub (1) fallback
         │                 │                 │
         └─────────────────┴─────────────────┘
                           ▼
                    SQLite + Parquet
```

---

## 3. Symbol registry

Canonical identity prevents NSE/BSE duplicates and US ticker collisions.

### Table: `symbols`

| Column | Type | Example |
|--------|------|---------|
| id | INTEGER PK | 1 |
| canonical_symbol | TEXT UNIQUE | `RELIANCE` |
| market | TEXT | `IN` / `US` |
| exchange | TEXT | `NSE`, `BSE`, `NYSE`, `NASDAQ` |
| yahoo_symbol | TEXT UNIQUE | `RELIANCE.NS`, `AAPL` |
| isin | TEXT | optional |
| currency | TEXT | `INR`, `USD` |
| active | BOOLEAN | true |
| created_at | TEXT | ISO8601 |

### Resolution rules (extends `yahoo_ticker_candidates`)

```
India, exchange unknown:
  try RELIANCE.NS (NSE preferred) → else RELIANCE.BO

India, exchange = BSE:
  use .BO only

US:
  use plain ticker (NYSE and NASDAQ share namespace on Yahoo)

Store winning yahoo_symbol + exchange on first successful quote.
```

### Watchlist-driven ingestion

**Do not ingest the full NSE/BSE universe (~3,000+ symbols).** Ingest only:

1. Symbols in user portfolios (from Stock Analyzer uploads)
2. Symbols in North Star equity inputs
3. Explicit user watchlist (max 50 symbols default)

This keeps storage, API calls, and cron time negligible for a solo dev.

---

## 4. ETL pipelines

Lightweight **extract → transform → load** scripts. No Airflow/Kafka required.

### Pipeline overview

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Extract      │──►│ Transform    │──►│ Validate     │──►│ Load         │
│ (adapters)   │   │ (normalize)  │   │ (quality)    │   │ (SQLite/     │
│              │   │              │   │              │   │  Parquet)    │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

### 4.1 `ingest_prices_daily`

**Trigger:** Cron daily (see §5)

| Step | Action |
|------|--------|
| Extract | `yf.Ticker(yahoo_symbol).history(period="5d")` for watchlist; NSE bhavcopy for IN validation |
| Transform | Normalize to OHLCV schema; `adj_close` preferred; UTC date |
| Validate | Reject rows with `close <= 0`; flag >10% single-day move vs prior close |
| Load | Upsert `price_bars`; append Parquet partition `data/prices/market=IN/symbol=RELIANCE/year=2026.parquet` |

```python
# Pseudocode
for sym in watchlist():
    bars = yfinance_fetch(sym, period="10y", interval="1d")
    bars = normalize_ohlcv(bars, sym)
    upsert_sqlite("price_bars", bars)
    append_parquet(sym, bars)
```

### 4.2 `ingest_fundamentals_weekly`

| Step | Action |
|------|--------|
| Extract | `ticker.info`, `balance_sheet`, `income_stmt`, `cashflow` (yfinance); US: EDGAR `companyfacts` |
| Transform | Map to flat snapshot: PE, PB, ROE, debt/equity, market_cap, sector |
| Load | Insert `fundamental_snapshots` with `as_of_date`; keep last 52 weekly rows per symbol |

### 4.3 `ingest_earnings`

| Step | Action |
|------|--------|
| Extract | `ticker.earnings_dates`, `quarterly_income_stmt`; US EDGAR for EPS |
| Transform | One row per fiscal quarter: `period_end`, `eps_actual`, `eps_estimate`, `surprise_pct` |
| Load | Upsert `earnings_quarters` |

### 4.4 `ingest_corporate_actions`

| Step | Action |
|------|--------|
| Extract | `ticker.actions` (dividends + splits); NSE corp-action file for IN |
| Transform | `action_type`: `dividend`, `split`, `bonus` (IN); `ex_date`, `ratio`, `amount` |
| Load | Upsert `corporate_actions` |

### 4.5 `ingest_news`

| Step | Action |
|------|--------|
| Extract | `ticker.news` (yfinance); Finnhub fallback for US |
| Transform | Dedupe by `url` or hash(title+published_at); sentiment keywords (Copilot reuse) |
| Load | Insert `news_items`; prune rows older than 90 days |

### 4.6 `ingest_insider`

| Step | Action |
|------|--------|
| Extract US | `edgartools` Form 4 for CIK mapped from ticker |
| Extract IN | NSE SAST / bulk-block deals page (weekly scrape) or manual CSV drop |
| Transform | `insider_name`, `transaction_type`, `shares`, `price`, `filed_at` |
| Load | Upsert `insider_trades` |

### 4.7 On-demand pipeline (user-triggered)

When user uploads Stock Analyzer Excel or opens Copilot:

```
POST /enrich-stock-portfolio (existing)
  → if symbol in cache and fresh → return cache
  → else run mini-ETL: prices 6mo + fundamentals + news (single symbol)
  → write cache row
  → return enrichment
```

This preserves today's UX while background cron fills long history.

### ETL file layout

```
server/
  data_ingestion/
    __init__.py
    adapters/
      yfinance_adapter.py      # wraps stock_market_data extensions
      nse_bhavcopy_adapter.py  # optional IN EOD
      sec_edgar_adapter.py     # US fundamentals + insider
      finnhub_adapter.py       # fallback
    pipelines/
      ingest_prices_daily.py
      ingest_fundamentals_weekly.py
      ingest_earnings.py
      ingest_corporate_actions.py
      ingest_news.py
      ingest_insider.py
    transform/
      normalize.py
      validate.py
    load/
      sqlite_loader.py
      parquet_loader.py
    scheduler.py               # APScheduler or cron entrypoints
    watchlist.py               # union of portfolio + north_star + user watchlist
```

### Job runner (solo-friendly)

**Option A — Cron on same machine as FastAPI (recommended)**

```cron
# /etc/cron or crontab -e
30 18 * * 1-5  cd /app/server && python -m data_ingestion.pipelines.ingest_prices_daily
0  6 * * 1     cd /app/server && python -m data_ingestion.pipelines.ingest_fundamentals_weekly
0  7 * * *     cd /app/server && python -m data_ingestion.pipelines.ingest_earnings
15 18 * * 1-5  cd /app/server && python -m data_ingestion.pipelines.ingest_corporate_actions
*/30 * * * *   cd /app/server && python -m data_ingestion.pipelines.ingest_news
0  8 * * 6     cd /app/server && python -m data_ingestion.pipelines.ingest_insider
```

IST times: 18:30 = after NSE close; US EOD covered next morning.

**Option B — APScheduler inside FastAPI** (single process; fine for dev)

```python
# scheduler.py — runs only when ENV ENABLE_INGESTION=true
scheduler.add_job(ingest_prices_daily, "cron", hour=18, minute=30, day_of_week="mon-fri")
```

---

## 5. Refresh schedules

Tiered by **staleness tolerance** and **API cost**.

| Dataset | Freshness target | Schedule | Watchlist only | Notes |
|---------|------------------|----------|----------------|-------|
| Price EOD | T+0 after close | Daily 18:30 IST (IN), 06:00 IST (US) | ✓ | On-demand 6mo for uploads |
| Price intraday | — | **Not in v1** | — | Defer; saves complexity |
| Fundamentals | 7 days | Weekly Sunday 06:00 IST | ✓ | `info` changes slowly |
| Earnings calendar | 1 day | Daily 07:00 IST | ✓ | Boost to 2×/day in earnings season |
| Earnings actuals | 1 day | Daily 07:00 IST | ✓ | After results season |
| Corporate actions | 1 day | Daily 18:15 IST | ✓ | Around ex-dates |
| News | 30–60 min | Every 30 min (market hours) | ✓ | Skip nights/weekends optional |
| Insider (US) | 7 days | Saturday 08:00 IST | ✓ | SEC filings batch |
| Insider (IN) | 7 days | Saturday 08:30 IST | ✓ | SAST weekly scrape |

### Market hours gate (reduce noise)

```
INGEST_NEWS only if:
  IN: 09:00–15:30 IST Mon–Fri
  US: 19:00–02:30 IST Mon–Fri (approx NYSE session in IST)
else skip or run once at EOD
```

### Staleness metadata

Every cache row carries `fetched_at`. API layer returns:

```json
{
  "data": { ... },
  "meta": {
    "fetched_at": "2026-06-10T13:00:00Z",
    "stale": false,
    "max_age_sec": 86400,
    "source": "yfinance"
  }
}
```

`stale = true` when `now - fetched_at > max_age` for that dataset → trigger background refresh, still serve old data.

---

## 6. Caching strategy

Three layers. **No Redis required for v1.**

### Layer 1 — Request cache (in-process)

| Scope | TTL | Implementation |
|-------|-----|----------------|
| Single symbol enrichment | 15 min | `functools.lru_cache` or dict keyed by `(symbol, dataset)` |
| Portfolio batch | 15 min | Same; invalidate on new upload |

Use for duplicate Copilot / enrich calls within one session.

### Layer 2 — SQLite application cache (primary)

Table: `data_cache`

| Column | Type | Notes |
|--------|------|-------|
| cache_key | TEXT PK | `price:RELIANCE.NS:daily` |
| payload_json | TEXT | or BLOB compressed |
| fetched_at | TEXT | |
| expires_at | TEXT | |
| source | TEXT | |
| etag | TEXT | optional |

Lookup before any external API call:

```
row = cache.get(key)
if row and row.expires_at > now:
    return row.payload
else:
    data = adapter.fetch(...)
    cache.set(key, data, ttl=...)
    return data
```

### Layer 3 — Parquet cold store (price history)

| Path pattern | Content |
|--------------|---------|
| `server/data/parquet/prices/{yahoo_symbol}/year={YYYY}.parquet` | OHLCV EOD |
| `server/data/parquet/fundamentals/{yahoo_symbol}/snapshots.parquet` | Weekly fundamentals |

- **Append-only** daily; compact yearly files
- Query via `duckdb` in-process (zero server cost) for Copilot technical indicators over 10Y
- Gitignore `server/data/` — local disk only

### Cache invalidation events

| Event | Invalidate |
|-------|------------|
| `wealth.import.stock_completed` | Portfolio symbols — price + fundamentals |
| `corporate_action.ingested` | Affected symbol — price history (adjust), fundamentals |
| User manual refresh | All keys for symbol |
| TTL expiry | Per-dataset schedule |

### Rate-limit protection

```python
YAHOO_MIN_INTERVAL_SEC = 0.4    # between calls
FINNHUB_DAILY_BUDGET = 200      # track in sqlite api_quota
BATCH_MAX_WORKERS = 4           # existing enrich_symbols_parallel
```

On 429/throttle: exponential backoff, serve stale cache, log `ingestion_errors`.

---

## 7. Storage model

### 7.1 SQLite (single file — solo dev default)

**File:** `server/data/market_data.db` (gitignored)

```
market_data.db
  symbols
  price_bars
  fundamental_snapshots
  earnings_quarters
  corporate_actions
  news_items
  insider_trades
  data_cache
  api_quota
  ingestion_runs          -- job audit log
```

#### `price_bars`

| Column | Type | Index |
|--------|------|-------|
| symbol_id | INTEGER FK | |
| trade_date | DATE | UNIQUE(symbol_id, trade_date) |
| open, high, low, close | REAL | |
| adj_close | REAL | |
| volume | INTEGER | |
| source | TEXT | |

#### `fundamental_snapshots`

| Column | Type |
|--------|------|
| symbol_id | INTEGER FK |
| as_of_date | DATE |
| pe_trailing, pe_forward, pb, peg | REAL |
| market_cap, enterprise_value | REAL |
| roe, debt_to_equity, current_ratio | REAL |
| sector, industry | TEXT |
| raw_json | TEXT |

#### `earnings_quarters`

| Column | Type |
|--------|------|
| symbol_id | INTEGER FK |
| fiscal_period_end | DATE |
| eps_actual, eps_estimate | REAL |
| surprise_pct | REAL |
| revenue | REAL |

#### `corporate_actions`

| Column | Type |
|--------|------|
| symbol_id | INTEGER FK |
| ex_date | DATE |
| action_type | TEXT |
| ratio | REAL |
| cash_amount | REAL |

#### `news_items`

| Column | Type |
|--------|------|
| symbol_id | INTEGER FK |
| published_at | TEXT |
| title | TEXT |
| url | TEXT UNIQUE |
| source | TEXT |
| sentiment_score | REAL |

#### `insider_trades`

| Column | Type |
|--------|------|
| symbol_id | INTEGER FK |
| filed_at | DATE |
| insider_name | TEXT |
| transaction_type | TEXT |
| shares | REAL |
| price | REAL |
| source | TEXT |

#### `ingestion_runs`

| Column | Type |
|--------|------|
| id | INTEGER PK |
| pipeline | TEXT |
| started_at, finished_at | TEXT |
| symbols_count | INTEGER |
| errors_count | INTEGER |
| status | TEXT |

### 7.2 Storage size estimate (watchlist 50 symbols)

| Dataset | ~Size |
|---------|-------|
| 10Y daily OHLCV × 50 | ~15 MB Parquet |
| Fundamentals weekly × 50 × 2Y | ~2 MB SQLite |
| News 90d × 50 | ~5 MB SQLite |
| **Total** | **< 50 MB** |

Negligible on any laptop or $5 VPS.

### 7.3 Upgrade path to PostgreSQL

When multi-user auth lands (North Star Phase 3):

- Migrate same schema to Postgres
- Parquet → S3-compatible bucket (Cloudflare R2 free tier) if needed
- SQLite remains valid for local dev

### 7.4 FX for North Star (INR reporting)

US holdings need INR marks for Wealth Engine:

| Source | Cost |
|--------|------|
| yfinance `INR=X` or `USDINR=X` | Free |
| Store in `fx_rates` table, daily refresh | |

```
value_inr = value_usd × usdinr_rate(as_of_date)
```

---

## 8. Service architecture

### Read path (FastAPI)

```
Client request
  → MarketDataService.get_bundle(symbol, datasets[])
       → CacheLayer.lookup per dataset
       → on miss: Adapter.fetch → CacheLayer.set → return
  → Investment Copilot / enrich_stock_portfolio
```

### New internal API (optional REST for debugging)

| Endpoint | Role |
|----------|------|
| `GET /market/symbol/{yahoo_symbol}/quote` | Latest price + meta |
| `GET /market/symbol/{yahoo_symbol}/history?period=1y` | OHLCV from store |
| `GET /market/symbol/{yahoo_symbol}/fundamentals` | Latest snapshot |
| `GET /market/symbol/{yahoo_symbol}/news?limit=20` | Cached headlines |
| `POST /market/ingest/refresh` | Admin: force refresh watchlist (API key gated) |

Existing endpoints unchanged; they call `MarketDataService` instead of raw yfinance over time.

### Integration with existing code

```python
# stock_market_data.py becomes thin facade:
from data_ingestion.service import MarketDataService

_service = MarketDataService()

def fetch_symbol_enrichment(symbol: str, market: str = "IN") -> dict:
    return _service.get_enrichment_bundle(symbol, market=market)
```

### Relationship to North Star event bus (§6.5 north_star.md)

| Event | Ingestion action |
|-------|------------------|
| `wealth.import.stock_completed` | Add symbols to watchlist; queue on-demand ingest |
| `wealth.import.cas_completed` | Extract equity symbols; same |
| `wealth.metrics.computed` | No ingest; read marks from store |
| `market.ingestion.completed` | Emit for UI "data refreshed at …" badge |

---

## 9. Cost and scaling

### Monthly cost scenarios

| Stage | Users | Symbols | Infra | APIs | ~Total |
|-------|-------|---------|-------|------|--------|
| Solo dev | 1 | < 50 | Laptop | Tier 0 | **$0** |
| Friends & family | < 20 | < 200 | $5 VPS | Tier 0–1 | **$5** |
| Early prod | 100+ | < 500 | $12 VPS + R2 | Tier 1 + Polygon starter | **$20–40** |

### Solo dev ops checklist

- [ ] One SQLite file, backed up weekly (`cp market_data.db backups/`)
- [ ] Cron logs to `server/logs/ingestion.log`
- [ ] Alert on `ingestion_runs.errors_count > 5` via email (optional)
- [ ] No Kubernetes, no Redis, no message broker until >1k watchlist symbols

### What not to build (yet)

- Real-time WebSocket ticks
- Full NSE universe ingestion
- Tick-level backtesting store
- Multi-region replication

---

## 10. Implementation phases

### Phase 1 — Foundation (1–2 weekends)

1. Create `server/data/market_data.db` schema
2. `MarketDataService` + `data_cache` layer
3. Refactor `fetch_symbol_enrichment` to read-through cache
4. US ticker support (`.NS`/`.BO` vs plain)
5. `ingest_prices_daily` + cron for watchlist
6. Parquet writer for OHLCV

### Phase 2 — Fundamentals & earnings (1 weekend)

1. `ingest_fundamentals_weekly`
2. `ingest_earnings`
3. Wire Investment Copilot to read from store (not live yfinance per request)

### Phase 3 — Actions, news, insider (1–2 weekends)

1. `ingest_corporate_actions`
2. `ingest_news` with 30-min schedule
3. US insider via `edgartools`
4. India SAST: manual CSV drop folder `server/data/drops/sast/` (scrape later)

### Phase 4 — North Star integration

1. Wealth Engine reads equity marks from `price_bars` latest close
2. USD → INR via `fx_rates`
3. Simulation Scenario E uses stored volatility (std of daily returns)
4. UI freshness badge on North Star + Stock Analyzer

---

## Summary

| Concern | Solo-dev choice |
|---------|-----------------|
| **Sources** | yfinance (primary) + SEC EDGAR (US) + NSE bhavcopy (optional IN) |
| **ETL** | Python scripts + cron; watchlist-only scope |
| **Refresh** | Daily prices; weekly fundamentals; 30-min news in market hours |
| **Cache** | In-process TTL → SQLite `data_cache` → Parquet history |
| **Storage** | SQLite + local Parquet (< 50 MB for 50 symbols) |
| **Cost** | $0 at dev scale; avoid paid APIs until necessary |

This architecture feeds North Star Mode and Investment Copilot with consistent, cached market data — without outgrowing a single developer's time or budget.
