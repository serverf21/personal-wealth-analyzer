# Personal Wealth Analyzer

An AI-powered personal finance platform that analyzes spending, investment portfolios, and wealth allocation. It provides manual dashboards plus optional AI insights (requires `OPENAI_API_KEY`).

## Run the server (FastAPI)

- cd server
- python3 -m venv venv
- source venv/bin/activate
- `pip install -r requirements.txt` (the `-r` reads the file; without it pip looks for a package named "requirements")
- (If you use Anaconda, run `conda deactivate` first so the app uses the venv’s packages.)
- Run the app with the venv’s Python so the reloader uses it: **python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000**
- Create `.env` inside `server`. Format:

```
OPENAI_API_KEY=YOUR_OPEN_AI_KEY
DEBUG=True
API_HOST=0.0.0.0
API_PORT=8000
```

Optional (CAS import cloud fallback):

```
CAS_PARSER_API_KEY=YOUR_CAS_PARSER_API_KEY
```

## Run the client (Expo / React Native Web)

- cd client
- npm run install
- npm run start

## Implemented dashboards (overview)

| Dashboard | What it does |
|-----------|--------------|
| **Account Statement Analyzer** | Upload bank PDF → tabulated data, spending charts, AI transaction insights. |
| **MF Analyzer** | Upload MF holdings Excel → allocation & concentration; **Manual** charts vs **AI** report + chat (AI report renders as readable sections when JSON is returned). |
| **Stock Market Analysis** | Upload equity holdings Excel → optional Yahoo-backed enrichment; **Manual** view vs **AI** report + chat. |
| **CAS / Demat import** | Upload India Consolidated Account Statement (CAMS/KFintech/CDSL eCAS/NSDL eCAS) PDF → server-side parsing into normalized holdings + totals by asset class. |
| **Wealth Distribution** | Enter **approx net worth**, optional **annual recurring income**, **upcoming expenses** (₹ Lakh) with **6- or 12-month** horizon, optional notes → **Manual** ideal split (₹ + %) for six segments from reference bands; **AI** suggests funding upcoming spends / boosting a bucket by shifting from other segments (with safety ordering). |
| **North Star Mode** | Enter income, expenses, assets, skills → **Compute** runs Wealth Engine, Simulation (A–F), Recommendations, Startup ideas, Knowledge Graph reasoning; **AI** narrative + Ask. Stock Analyzer adds **Copilot** tab (Buy/Hold/Exit signals). |

Flow diagrams also live in **`Flowchart.md`**. A compact set is included below for quick reference.

## Flowcharts (current)

### Shared app flow

```mermaid
flowchart LR
  U[User] --> C[Client: Expo / React Native Web]
  C -->|HTTP| S[Server: FastAPI]
  S -->|optional| OAI[OpenAI API]
```

### Account Statement Analyzer

```mermaid
flowchart TD
  A[Open dashboard] --> B[Upload bank PDF]
  B --> C[POST /upload-pdf]
  C --> D[Extract tables with pdfplumber]
  D --> E[Store JSON in session]
  E --> F{Choose tab}
  F -->|Tabulated| G[GenericTable]
  F -->|Charts| H[SpendingCharts]
  F -->|AI Insights| I[POST /analyze-ai-transactions]
  I --> J[AITransactionAnalyzer + OpenAI]
  J --> K[Insights + recommendations]
```

### MF Analyzer

```mermaid
flowchart TD
  A[Open MF Analyzer] --> B[Upload holdings .xlsx]
  B --> C[POST /upload-mf-holdings-excel]
  C --> D[Parse holdings + computed allocations]
  D --> E[Session save]
  E --> F{Tab}
  F -->|Manual| G[KPI cards + charts]
  F -->|AI| H[POST /analyze-mf-ai]
  H --> I[AIMFAnalyzer returns JSON or text]
  I --> J[Client parses JSON + renders readable sections]
  F -->|Ask| K[POST /ask-mf-ai]
```

### Stock Market Analysis

```mermaid
flowchart TD
  A[Open Stock Analysis] --> B[Upload equity .xlsx]
  B --> C[POST /upload-stock-holdings-excel]
  C --> D[Parse holdings quickly]
  D --> E[Optional: enrich]
  E --> F[POST /enrich-stock-portfolio]
  F --> G[Parallel market data enrichment]
  G --> H[Manual hints + charts]
  H --> I{AI}
  I -->|Report| J[POST /analyze-stock-ai]
  I -->|Ask| K[POST /ask-stock-ai]
```

### CAS / Demat import

```mermaid
flowchart TD
  A[Open CAS / Demat import] --> B[Upload CAS PDF + password]
  B --> C[POST /parse-cas-pdf]
  C --> D[Server parses locally via casparser]
  D --> E[Normalize into holdings + totals by asset class]
  C -->|Optional fallback| F[Cloud parse via api.casparser.in]
  F --> E
  E --> G[Client shows totals + JSON]
```

### Wealth Distribution

```mermaid
flowchart TD
  A[Open Wealth Distribution] --> B[Enter NW + optional income + upcoming spend + horizon + notes]
  B --> C[Compute reference split (₹ ranges) from bands]
  C --> D[Manual alerts (short-term / emergency heuristics)]
  D --> E{Tab}
  E -->|Manual| F[Segments + midpoint chart]
  E -->|AI insights| G[POST /analyze-wealth-distribution-ai]
  E -->|Ask| H[POST /ask-wealth-distribution-ai]
```

## Design docs

| Doc | Description |
|-----|-------------|
| [`docs/north_star.md`](docs/north_star.md) | North Star Mode — Wealth Engine, Simulation Engine, path ranking |
| [`docs/investment_copilot.md`](docs/investment_copilot.md) | Investment Copilot — per-symbol signals (Buy/Hold/Exit), reasoning chains, APIs |
| [`docs/market_data_ingestion.md`](docs/market_data_ingestion.md) | Market data ingestion — NSE/BSE/NYSE/NASDAQ, ETL, caching, SQLite storage |

## Backlog / future features

- **North Star Mode**, **Investment Copilot** (see design docs above)
- **Budget Tracker**, **Goal Planner**, **Debt Manager**, **Cash Flow**, **Tax Optimizer**
- Cross-dashboard “home” summary, performance analytics, overlap analysis, India-first integrations (CAS-based imports expanded to more asset classes and actions)
