# North Star Mode — Product Architecture

A strategic milestone advisor for Personal Wealth Analyzer that answers:

> **"What is the fastest realistic path to my next wealth milestone?"**

Targets include ₹1Cr, ₹5Cr, ₹10Cr, and beyond. The dashboard evaluates seven dimensions — current income, savings rate, existing investments, stock portfolio, fixed income, startup/business opportunities, and career growth — and ranks realistic paths to the next milestone.

This design extends the existing platform pattern: **deterministic engine first, AI narrative second**, client-side `sessionStorage`, FastAPI services, and cross-dashboard data reuse.

---

## Table of contents

1. [User journeys](#1-user-journeys)
2. [Main dashboard sections](#2-main-dashboard-sections)
3. [Recommended architecture](#3-recommended-architecture)
4. [Data flow](#4-data-flow)
5. [Future extensibility plan](#5-future-extensibility-plan)
6. [Wealth Engine](#6-wealth-engine)
   - [Inputs and outputs](#61-inputs-and-outputs)
   - [Database schema](#62-database-schema)
   - [Wealth calculation formulas](#63-wealth-calculation-formulas)
   - [Aggregation logic](#64-aggregation-logic)
   - [Event-driven architecture](#65-event-driven-architecture)
7. [Wealth Simulation Engine](#7-wealth-simulation-engine)
   - [Role and relationship to Wealth Engine](#71-role-and-relationship-to-wealth-engine)
   - [Scenarios A–F](#72-scenarios-af)
   - [Architecture](#73-architecture)
   - [Simulation logic](#74-simulation-logic)
   - [Output schema](#75-output-schema)
   - [API and integration](#76-api-and-integration)
8. [North Star Recommendation Engine](#8-north-star-recommendation-engine)
   - [Role in the stack](#81-role-in-the-stack)
   - [Inputs and actions](#82-inputs-and-actions)
   - [Architecture](#83-architecture)
   - [Scoring algorithms](#84-scoring-algorithms)
   - [Ranking and conflict resolution](#85-ranking-and-conflict-resolution)
   - [Output schema and API](#86-output-schema-and-api)
9. [Startup Opportunity Engine](#9-startup-opportunity-engine)
   - [Role in the stack](#91-role-in-the-stack)
   - [Analysis domains](#92-analysis-domains)
   - [Architecture](#93-architecture)
   - [Idea generation and revenue projections](#94-idea-generation-and-revenue-projections)
   - [Difficulty score and skills gap](#95-difficulty-score-and-skills-gap)
   - [Go-to-market roadmap](#96-go-to-market-roadmap)
   - [Wealth creation ranking](#97-wealth-creation-ranking)
   - [Output schema and API](#98-output-schema-and-api)
10. [Personal Wealth Knowledge Graph](#10-personal-wealth-knowledge-graph)
   - [Role in the stack](#101-role-in-the-stack)
   - [Graph schema](#102-graph-schema)
   - [Architecture](#103-architecture)
   - [Ingestion and sync](#104-ingestion-and-sync)
   - [Reasoning queries](#105-reasoning-queries)
   - [API and storage](#106-api-and-storage)

---

## 1. User journeys

### Journey A — First-time setup ("Set my North Star")

**Flow**

```
User opens North Star Mode
  → Pick target milestone (₹1Cr / ₹5Cr / ₹10Cr / custom)
  → Confirm current net worth (manual or import from Wealth Distribution / CAS)
  → Enter or link income + savings rate (manual or Account Statement hint)
  → Import or enter investments (MF / Stock / CAS / manual)
  → Optional: add career growth % or startup upside scenario
  → Engine computes baseline ETA + ranked paths
  → AI summarizes fastest realistic path (AI Insights tab)
```

| Step | User action | System behavior |
|------|-------------|-----------------|
| 1 | Opens dashboard from sidebar | Shows current milestone ring (e.g. "₹42L → ₹1Cr") |
| 2 | Selects next target (₹1Cr / ₹5Cr / custom) | Stores `target_milestone_inr` |
| 3 | Confirms net worth | Pre-fills from Wealth Distribution or CAS import if available |
| 4 | Enters monthly income, expenses, savings | Derives savings rate; optionally pulls from Account Statement Analyzer |
| 5 | Links MF / stock / FD holdings | Aggregates investable corpus + growth assumptions |
| 6 | Adds career growth % or startup upside scenario | Flags as optional "accelerator" levers |
| 7 | Reviews Manual tab | Shows 2–3 ranked paths with ETA ranges |
| 8 | Switches to AI tab | Gets plain-language strategy + trade-offs |

---

### Journey B — Returning user ("What changed?")

**Flow**

```
User returns to North Star Mode
  → System loads last snapshot from sessionStorage
  → Compare delta: net worth, savings rate, portfolio growth vs last visit
  → On track?
       Yes → Reinforce current path + next micro-goal
       No  → Show drift + revised fastest path
            → Suggest 1–2 high-impact actions
```

| Signal | Example output |
|--------|----------------|
| Savings rate drop | "Savings rate dropped 8% → ETA pushed out 14 months." |
| NW ahead of plan | "You're 6 months ahead of baseline — consider raising target." |
| Portfolio underperformance | "Equity sleeve lagging assumption — path rank may shift." |

---

### Journey C — "What-if" exploration

User adjusts sliders or scenario inputs; **Manual engine** recalculates instantly; **AI tab** explains trade-offs.

| Scenario | Example input | Output |
|----------|---------------|--------|
| Income bump | +20% raise in 12 months | New ETA, path rank change |
| Higher savings | 40% → 55% savings rate | Months saved to milestone |
| Equity tilt | Shift 10% FD → equity | Risk-adjusted ETA band |
| Startup bet | ₹10L/year for 3 years, 15% equity upside | Best / base / worst case paths |
| Sabbatical | 6-month income gap | Milestone delay + recovery plan |

---

### Journey D — Milestone achieved → next North Star

**Flow**

```
System detects net_worth >= target (manual confirm or import)
  → Celebration + snapshot archive
  → Auto-suggest next milestone (e.g. ₹1Cr → ₹5Cr)
  → Recalibrate assumptions for new target
  → Show historical accuracy ("You beat baseline by 8 months")
```

---

## 2. Main dashboard sections

### Section 1 — North Star Header (always visible)

| Element | Purpose |
|---------|---------|
| Progress ring | Current NW vs next milestone (₹ and %) |
| ETA band | "18–24 months at current trajectory" |
| Confidence badge | High / medium / low based on data completeness |
| Primary CTA | "See fastest path" → scrolls to Path Ranker |

---

### Section 2 — Financial Snapshot (inputs + auto-import)

Seven evaluation dimensions mapped to UI blocks:

| Dimension | Source | UI |
|-----------|--------|-----|
| Current income | Manual / Account Statement | Monthly gross + net, growth % |
| Savings rate | Income − expenses | Rate %, trend sparkline |
| Existing investments | CAS / MF / Stock dashboards | Total corpus by asset class |
| Stock portfolio | Stock Analyzer | Equity %, expected return band |
| Fixed income | Manual / CAS debt | FD, PPF, debt MF; yield % |
| Startup / business | Manual scenario | Optional upside module |
| Career growth | Manual | Role, industry, expected CAGR |

**Data completeness meter** — nudges user to import CAS or link analyzers.

---

### Section 3 — Path Ranker (core Manual output)

Ranks 3–5 **realistic paths**, each with:

- **Name** — e.g. "Savings-first", "Income acceleration", "Balanced growth"
- **ETA range** — pessimistic / base / optimistic (months)
- **Primary lever** — what drives most of the delta
- **Requirements** — "Maintain 45% savings + 12% portfolio CAGR"
- **Risk level** — conservative / moderate / aggressive

**Default path templates** map to **Wealth Simulation Engine** scenarios (§7):

| Path Ranker label | Simulation scenario |
|-------------------|---------------------|
| Pure accumulation | A — Continue current career |
| Income acceleration | B — Job switch |
| Opportunistic | C — SaaS startup or D — AI consulting |
| Allocation shift | E — Aggressive stock investing |
| Balanced growth | F — Balanced investing |

Ranking philosophy: **fastest *realistic*** — uses `probability_of_success` and `risk_score` from the simulation engine, not raw NW alone.

---

### Section 4 — Milestone Timeline

- Horizontal timeline: today → ₹1Cr → ₹5Cr → ₹10Cr
- Stacked scenarios (base vs accelerated)
- Inflection points: when savings surpass investment returns; when compounding dominates

---

### Section 5 — Recommendation Board (actionable levers)

Powered by the **Recommendation Engine** (§8). Shows ranked actions — Invest more, Save more, Build startup, Upskill, Switch job, Diversify, Concentrate — with expected NW impact at 1Y / 3Y / 5Y.

| Rank | Action | Score | Expected Δ NW (3Y) | Confidence |
|------|--------|-------|-------------------|------------|
| 1 | Switch job | 78 | +₹42L | 72% |
| 2 | Save more | 71 | +₹28L | 85% |
| 3 | Invest more | 64 | +₹22L | 68% |

Drill-down: reasoning chain per action (same audit pattern as Investment Copilot).

---

### Section 6 — Assumptions Panel (transparency)

Editable defaults (India-first):

| Assumption | Default |
|------------|---------|
| Inflation | 6% |
| Equity long-term CAGR | 10–12% |
| Debt / FD | 7–8% |
| Salary growth | User-defined |
| Tax drag | Simplified slab estimate (optional v2) |

All ETAs recompute when assumptions change.

---

### Section 7 — AI Strategic Advisor

Three tabs mirroring other dashboards:

| Tab | Behavior |
|-----|----------|
| **Manual** | Path Ranker, timeline, levers (deterministic) |
| **AI Insights** | `POST /analyze-north-star-ai` — narrative strategy, risks, sequencing |
| **Ask** | `POST /ask-north-star-ai` — contextual chat over snapshot |

AI receives the **full computed payload** (paths, ETAs, gaps) and must not invent numbers the engine didn't produce.

---

### Section 8 — History & Accuracy (lightweight v1)

- Last 5 snapshots in `sessionStorage` (v1)
- "Predicted vs actual" when user updates NW
- Builds trust and improves future calibration

---

## 3. Recommended architecture

### High-level system view

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client (Expo / React Native Web)              │
│  ┌──────────────────┐  ┌─────────────────┐  ┌───────────────┐ │
│  │ North Star       │  │ sessionStorage  │  │ Cross-dash    │ │
│  │ Dashboard        │──│ snapshots       │  │ readers       │ │
│  └────────┬─────────┘  └─────────────────┘  └───────┬───────┘ │
└───────────┼──────────────────────────────────────────┼─────────┘
            │ POST compute + AI                          │ read
            ▼                                            ▼
┌───────────────────────┐              ┌────────────────────────────┐
│ Server (FastAPI)      │              │ Existing dashboards        │
│  /north-star/*        │              │  Wealth Distribution       │
│  NorthStarEngine      │              │  Account Analyzer          │
│  AINorthStarAnalyzer  │              │  MF / Stock / CAS Import   │
└───────────────────────┘              └────────────────────────────┘
```

### Layer breakdown

| Layer | Responsibility | New artifacts |
|-------|----------------|---------------|
| **Presentation** | Dashboard UI, tabs, charts | `client/dashboards/north-star/north-star.tsx` |
| **Client adapters** | Read other dashboards' sessionStorage; normalize snapshot | `client/services/north-star-snapshot.ts` |
| **API** | HTTP endpoints | `server/main.py` — `/compute-north-star`, `/analyze-north-star-ai`, `/ask-north-star-ai` |
| **Wealth Engine** | NW, FI score, velocity, milestone ETAs (no LLM) | `server/services/wealth_engine.py` |
| **Wealth Simulation Engine** | Multi-scenario projections A–F (no LLM) | `server/services/wealth_simulation_engine.py` |
| **Startup Opportunity Engine** | Skill-matched ideas, revenue, GTM; wealth rank (§9) | `server/services/startup_opportunity_engine/` |
| **Recommendation Engine** | Rank actions (§8); maximize NW growth 1/3/5Y | `server/services/recommendation_engine.py` |
| **Knowledge Graph** | Entity graph, sync, reasoning queries (§10) | `server/services/knowledge_graph/` |
| **Domain engine** | Path orchestration; consumes Wealth + Simulation + Recommendations | `server/services/north_star_engine.py` |
| **AI service** | Narrative over computed payload | `server/services/analyze_north_star_ai.py` |
| **Types** | Shared contract | `client/types/north-star.ts`, Pydantic models in `main.py` |

### Core domain model

```typescript
// Conceptual — shared contract between client and server

interface NorthStarSnapshot {
  as_of: string;
  net_worth_inr: number;
  target_milestone_inr: number;
  income: {
    monthly_gross_inr: number;
    monthly_net_inr: number;
    annual_growth_pct: number;
  };
  cashflow: {
    monthly_expenses_inr: number;
    savings_rate_pct: number;
  };
  investments: {
    equity_inr: number;
    debt_inr: number;
    other_inr: number;
    blended_expected_return_pct: number;
  };
  accelerators?: {
    career_growth_pct?: number;
    startup_scenario?: StartupScenario;
  };
  assumptions: AssumptionSet;
  data_completeness: number; // 0–1
}

interface PathProjection {
  id: string;
  name: string;
  eta_months: { pessimistic: number; base: number; optimistic: number };
  primary_lever: string;
  requirements: string[];
  risk_level: "conservative" | "moderate" | "aggressive";
  monthly_contributions: number[];
  net_worth_projection: number[];
}
```

### North Star Engine (deterministic heart)

Responsibilities — **no LLM**:

| Module | Purpose |
|--------|---------|
| Milestone resolver | Next target from presets or custom INR |
| Trajectory simulator | Month-by-month: income growth, contributions, portfolio compounding |
| Path generator | Instantiate path templates with user parameters |
| Path ranker | Score by `realism_weight × speed_weight × risk_penalty` |
| Sensitivity analyzer | Delta ETA per 1% savings, ₹1L income, 1% allocation shift |
| Gap analyzer | `gap_inr = target - projected_nw_at_horizon` |

### API contract

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /compute-north-star` | `NorthStarRequest { snapshot }` | `paths[]`, `timeline`, `levers`, `assumptions_used` |
| `POST /analyze-north-star-ai` | `{ north_star_payload }` | JSON report (summary, recommended_path, sequencing, risks) |
| `POST /ask-north-star-ai` | payload + question + history | Answer grounded in payload |

Server stays stateless; client sends full snapshot (same pattern as Wealth Distribution).

### Cross-dashboard integration (v1 — sessionStorage adapters)

| Dashboard | sessionStorage / payload key | Fields extracted |
|-----------|------------------------------|------------------|
| Wealth Distribution | `wealth-distribution-form-v2` | `netWorthLakh`, `annualIncomeLakh` |
| Account Analyzer | transaction session | Avg monthly spend → savings rate hint |
| MF / Stock / CAS | respective upload payloads | Holdings totals, allocation % |

A **"Refresh from dashboards"** button re-reads adapters. No shared DB in v1.

### AI guardrails

- System prompt: use only numbers from `computed_paths` and `sensitivity`; do not invent ETAs
- Structured JSON output (same pattern as Wealth Distribution AI)
- Required `disclaimer` field
- Temperature ~0.35 (match existing advisors)

### Menu integration

Add to `client/constants/menu-items.ts`:

```
{ id: 'north-star', title: 'North Star Mode', icon: '⭐' }
```

Register in `client/App.tsx` and `client/types/types.ts` (`DashboardId`).

---

## 4. Data flow

### End-to-end ingestion and compute

```
[User inputs] ──────────────────────────────┐
[Import from dashboards] ───────────────────┼──► NorthStarSnapshot builder
                                            │
                                            ▼
                              sessionStorage (north-star-v1)
                                            │
                                            ▼
                              POST /compute-north-star
                                            │
                                            ▼
                              WealthEngine
                                 ├── NW, FI score, velocity
                                 └── Milestone projections (1/5/10 Cr)
                                            │
                                            ▼
                              WealthSimulationEngine
                                 ├── Scenarios A–F (monthly loop)
                                 ├── Risk + P(success) per horizon
                                 └── path_score ranking input
                                            │
                                            ▼
                              StartupOpportunityEngine
                                 ├── Skill × vertical templates
                                 ├── Revenue + GTM per idea
                                 └── wealth_creation_score rank
                                            │
                                            ▼
                              RecommendationEngine
                                 ├── Score 7 actions × 1/3/5Y
                                 ├── Conflict resolution (diversify vs concentrate)
                                 └── Reasoning chains
                                            │
                                            ▼
                              KnowledgeGraph.sync
                                 ├── Nodes: User, Skills, Goals, …
                                 ├── Edges: ACCELERATES, COMPOUNDS, BLOCKS
                                 └── ReasoningEngine.query
                                            │
                                            ▼
                              NorthStarEngine
                                 ├── Assemble unified payload
                                 └── Sensitivity analyzer
                                            │
                                            ▼
                              NorthStarPayload
                                 ├──► Manual tab UI
                                 ├──► POST /analyze-north-star-ai ──► OpenAI ──► AI Insights tab
                                 └──► POST /ask-north-star-ai ──────► OpenAI ──► Ask tab

User edits assumptions / what-if sliders
  → updates snapshot
  → re-POST /compute-north-star
  → UI refreshes

NorthStarPayload
  → append to snapshot history
  → sessionStorage
```

### Compute request sequence

```
Client                          FastAPI                    NorthStarEngine
  │                                │                              │
  │  POST /compute-north-star      │                              │
  │  (snapshot)                    │                              │
  │───────────────────────────────►│  simulate + rank paths       │
  │                                │─────────────────────────────►│
  │                                │◄─────────────────────────────│
  │                                │  paths, timeline, levers,    │
  │                                │  sensitivity                 │
  │◄───────────────────────────────│                              │
  │  NorthStarPayload              │                              │
  │                                │                              │
  │  [User opens AI tab]           │                              │
  │  POST /analyze-north-star-ai   │                              │
  │───────────────────────────────►│  AINorthStarAnalyzer         │
  │                                │──────────► OpenAI            │
  │◄───────────────────────────────│◄──────────                   │
  │  structured JSON narrative     │                              │
```

### Path ranking internal flow

```
NorthStarSnapshot
  → validate + normalize inputs
  → compute monthly savings (income - expenses)
  → blend portfolio expected return (equity/debt/other weights)
  → for each path template:
       run month-by-month simulation until NW >= target
       record ETA (pessimistic / base / optimistic)
  → score paths (speed × realism − risk penalty)
  → sort descending
  → compute lever sensitivities
  → emit NorthStarPayload
```

---

## 5. Future extensibility plan

### Phase 1 — MVP

Aligns with current stack; no new persistence layer.

| Deliverable | Detail |
|-------------|--------|
| Milestone presets | ₹1Cr, ₹5Cr, ₹10Cr + custom |
| Inputs | Manual + Wealth Distribution / CAS import adapters |
| Engine | Deterministic; 3 path templates minimum |
| AI | Report + Ask tab |
| Storage | `sessionStorage` only |

**Steps**

1. Add `north-star` menu item and dashboard shell (Manual / AI / Ask tabs)
2. Implement `NorthStarSnapshot` builder + sessionStorage read/write
3. Implement `north_star_engine.py` with simulator + 3 paths
4. Wire `POST /compute-north-star`
5. Implement `analyze_north_star_ai.py` + endpoints
6. Build Path Ranker, Timeline, Lever Board UI sections
7. Add cross-dashboard "Refresh from dashboards" adapter

---

### Phase 2 — Richer data & calibration

| Extension | Benefit |
|-----------|---------|
| Deep Account Analyzer link | Auto savings rate, income stability score |
| MF + Stock expected return from holdings | Portfolio-specific CAGR bands |
| Snapshot diff on each visit | Drift alerts, "on track" badge |
| Custom milestones + multi-goal queue | e.g. ₹2.5Cr house + ₹1Cr NW in parallel |

**Steps**

1. Expand adapters for MF/Stock computed payloads
2. Add snapshot diff service on client
3. Add on-track / drift UI in header
4. Support multiple queued milestones in snapshot schema v2

---

### Phase 3 — Persistence & home summary

| Extension | Benefit |
|-----------|---------|
| User profiles + encrypted cloud storage | Cross-device continuity |
| Home dashboard | Aggregating all North Star progress |
| Nudges | Email / push when savings rate slips |

**Steps**

1. Optional auth + encrypted snapshot store
2. Home summary dashboard (readme backlog item)
3. Notification hooks for drift events

---

### Phase 4 — Advanced advisors

| Module | Description |
|--------|-------------|
| Tax-aware paths | Integrate Tax Optimizer when built |
| Debt drag | Debt Manager reduces effective savings — adjust ETA |
| Monte Carlo | Extend Wealth Simulation Engine (§7) with return distributions per scenario |
| Career graph | Industry salary benchmarks (external API) |
| Startup module v2 | Cap table scenarios, dilution, exit probability tiers |

**Steps**

1. Pluggable simulator interface (`DeterministicSimulator` → `MonteCarloSimulator`)
2. Tax drag adapter when Tax Optimizer exists
3. External benchmark API adapter for career module

---

### Phase 5 — Platform hooks

Cross-dashboard integration at the product level:

```
North Star Engine
  ↔ Goal Planner      (sub-milestones: emergency fund before ₹1Cr push)
  ↔ Wealth Distribution (rebalance hints when path requires allocation shift)
  ↔ Cash Flow           (monthly budget caps tied to required savings rate)
```

**Extensibility principles**

1. **Engine is pure functions** — easy to unit test; swap simulators without UI changes
2. **Snapshot schema versioned** (`north-star-v1`, `v2`) — client migration on read
3. **Path templates as config** — JSON/YAML definitions, not hardcoded branches
4. **AI never owns math** — only interprets `NorthStarPayload`; engine is source of truth
5. **Adapters per data source** — new import (EPFO, NPS, etc.) adds adapter, not dashboard rewrite

---

## 6. Wealth Engine

The **Wealth Engine** is the deterministic core of North Star Mode. It ingests normalized financial inputs, computes current wealth state, scores financial health, and projects time-to-milestone. `NorthStarEngine` (path ranking, AI context) sits on top of Wealth Engine outputs — it does not duplicate NW or ETA math.

**v1 note:** The app today uses `sessionStorage` and stateless FastAPI. The schema below is the target persistence layer (Phase 3). Until then, the same shapes are stored as JSON blobs in `sessionStorage` and passed in API request bodies.

### 6.1 Inputs and outputs

#### Inputs

| Input | Type | Unit | Source (priority order) |
|-------|------|------|-------------------------|
| Salary | Cashflow | ₹/month (gross or net; net preferred) | Manual → Account Statement Analyzer |
| Expenses | Cashflow | ₹/month | Manual → Account Statement Analyzer |
| Emergency fund | Asset | ₹ (liquid) | Manual → Wealth Distribution segment |
| Equity investments | Asset | ₹ (mark-to-market) | Stock Analyzer → CAS import |
| Mutual funds | Asset | ₹ (NAV × units) | MF Analyzer → CAS import |
| Bonds | Asset | ₹ | Manual → CAS import |
| FDs | Asset | ₹ (principal) | Manual → CAS import |
| Crypto | Asset | ₹ (mark-to-market) | Manual |
| Startup equity | Asset | ₹ (fair value or cost basis + haircut) | Manual |
| Side income | Cashflow | ₹/month | Manual |

All monetary values stored and computed in **INR**. Asset inputs accept optional `valuation_method` (`market`, `cost`, `discounted`) for illiquid holdings.

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| Current Net Worth | ₹ | Sum of recognized assets minus liabilities |
| Financial Independence Score | 0–100 | How close user is to covering expenses from investable wealth |
| Wealth Velocity Score | 0–100 | Speed and quality of NW growth (savings + investment returns) |
| Time to ₹1Cr | months (range) | ETA at pessimistic / base / optimistic assumptions |
| Time to ₹5Cr | months (range) | Same |
| Time to ₹10Cr | months (range) | Same |

---

### 6.2 Database schema

PostgreSQL-oriented schema. UUIDs for PKs; amounts as `NUMERIC(18,2)`; timestamps UTC.

#### Entity relationship overview

```
users
  ├── wealth_profiles (1:1)
  ├── income_streams (1:n)
  ├── asset_holdings (1:n)
  ├── wealth_snapshots (1:n)     ← point-in-time input + output bundle
  ├── wealth_metrics (1:n)       ← denormalized scores per snapshot
  ├── milestone_projections (1:n)
  └── wealth_events (1:n)        ← append-only event log
```

#### `users`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | VARCHAR UNIQUE | nullable until auth |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `wealth_profiles`

One row per user; holds slow-changing defaults and simulation assumptions.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | UNIQUE |
| currency | CHAR(3) | default `INR` |
| equity_expected_return_pct | NUMERIC(5,2) | default 11.0 |
| mf_expected_return_pct | NUMERIC(5,2) | default 10.5 |
| bonds_expected_return_pct | NUMERIC(5,2) | default 7.5 |
| fd_expected_return_pct | NUMERIC(5,2) | default 7.0 |
| crypto_expected_return_pct | NUMERIC(5,2) | default 8.0 (high vol) |
| startup_equity_haircut_pct | NUMERIC(5,2) | default 50.0 (illiquidity discount) |
| inflation_pct | NUMERIC(5,2) | default 6.0 |
| salary_growth_pct | NUMERIC(5,2) | default 8.0 |
| fi_target_multiple | NUMERIC(4,2) | default 25 (25× annual expenses) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `income_streams`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| stream_type | ENUM | `salary`, `side_income` |
| amount_monthly_inr | NUMERIC(18,2) | |
| is_net | BOOLEAN | true = after tax |
| growth_rate_pct | NUMERIC(5,2) | annual |
| source | VARCHAR | `manual`, `account_analyzer`, `import` |
| source_ref | JSONB | external id / import batch |
| effective_from | DATE | |
| effective_to | DATE | nullable |
| created_at | TIMESTAMPTZ | |

#### `asset_holdings`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| asset_class | ENUM | `emergency_fund`, `equity`, `mutual_funds`, `bonds`, `fds`, `crypto`, `startup_equity` |
| value_inr | NUMERIC(18,2) | |
| valuation_method | ENUM | `market`, `cost`, `discounted` |
| liquidity_tier | ENUM | `immediate`, `t_plus_3`, `illiquid` |
| expected_return_pct | NUMERIC(5,2) | override; null → profile default |
| source | VARCHAR | `manual`, `mf_analyzer`, `stock_analyzer`, `cas_import` |
| source_ref | JSONB | |
| as_of_date | DATE | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Unique constraint: `(user_id, asset_class, source, source_ref)` when `source_ref` is set — prevents duplicate imports.

#### `wealth_snapshots`

Immutable input bundle at computation time. Drives audit and drift detection.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| snapshot_at | TIMESTAMPTZ | |
| inputs_json | JSONB | frozen copy of all 10 inputs |
| liabilities_inr | NUMERIC(18,2) | default 0 (v2) |
| data_completeness | NUMERIC(3,2) | 0.00–1.00 |
| trigger_event_id | UUID FK → wealth_events | nullable |

#### `wealth_metrics`

Computed outputs for a snapshot (1:1 with snapshot).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| snapshot_id | UUID FK → wealth_snapshots | UNIQUE |
| net_worth_inr | NUMERIC(18,2) | |
| investable_wealth_inr | NUMERIC(18,2) | excludes emergency fund from FI numerator logic |
| monthly_savings_inr | NUMERIC(18,2) | |
| savings_rate_pct | NUMERIC(5,2) | |
| fi_score | NUMERIC(5,2) | 0–100 |
| wealth_velocity_score | NUMERIC(5,2) | 0–100 |
| blended_portfolio_return_pct | NUMERIC(5,2) | |
| computed_at | TIMESTAMPTZ | |

#### `milestone_projections`

One row per milestone per scenario band per snapshot.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| snapshot_id | UUID FK | |
| milestone_inr | NUMERIC(18,2) | 10000000, 50000000, 100000000 |
| scenario | ENUM | `pessimistic`, `base`, `optimistic` |
| months_to_milestone | INTEGER | null if already achieved |
| projected_date | DATE | |
| already_achieved | BOOLEAN | |

Index: `(snapshot_id, milestone_inr, scenario)`.

#### `wealth_events`

Append-only event log for event-driven recomputation.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| event_type | VARCHAR | see §6.5 |
| payload | JSONB | event-specific data |
| idempotency_key | VARCHAR | UNIQUE per user; dedup imports |
| occurred_at | TIMESTAMPTZ | |
| processed_at | TIMESTAMPTZ | nullable |
| status | ENUM | `pending`, `processed`, `failed` |

#### v1 sessionStorage mapping (no DB)

| DB table | sessionStorage key |
|----------|-------------------|
| `wealth_snapshots.inputs_json` | `north-star-inputs-v1` |
| `wealth_metrics` + `milestone_projections` | `north-star-metrics-v1` |
| `wealth_events` (last N) | `north-star-events-v1` |

---

### 6.3 Wealth calculation formulas

All formulas are implemented in `server/services/wealth_engine.py` as pure functions. Inputs are validated and normalized before computation.

#### Step 1 — Normalize cashflow

```
total_income_monthly = salary_monthly + side_income_monthly

monthly_savings = total_income_monthly - expenses_monthly

savings_rate_pct = clamp(
  (monthly_savings / total_income_monthly) × 100,
  -100, 100
)   // guard divide-by-zero: if income = 0, savings_rate = 0
```

#### Step 2 — Current Net Worth

```
gross_assets =
  emergency_fund
  + equity_investments
  + mutual_funds
  + bonds
  + fds
  + crypto
  + startup_equity_effective

startup_equity_effective =
  if valuation_method = 'discounted' or 'cost':
    startup_equity × (1 - startup_equity_haircut_pct / 100)
  else:
    startup_equity

current_net_worth = gross_assets - liabilities_inr
```

**Investable wealth** (used for FI score, excludes emergency buffer):

```
investable_wealth = gross_assets - emergency_fund
```

Emergency fund is part of NW but treated separately for independence scoring — it covers shocks, not long-term passive income.

#### Step 3 — Blended portfolio expected return

Weight each asset class by its share of investable wealth:

```
w_i = asset_value_i / investable_wealth   (0 if investable_wealth = 0)

r_i = asset-specific expected_return_pct (from holding override or wealth_profile default)

blended_return_pct = Σ (w_i × r_i)
```

Default return assumptions (overridable per profile):

| Asset class | Default annual return % |
|-------------|-------------------------|
| Equity | 11.0 |
| Mutual funds | 10.5 |
| Bonds | 7.5 |
| FDs | 7.0 |
| Crypto | 8.0 (mean; high variance) |
| Startup equity | 0.0 (until liquidity event; upside captured in scenarios) |

#### Step 4 — Financial Independence Score (0–100)

Measures progress toward covering annual expenses from investable wealth, using a **25× expenses** target (4% rule variant, India-adjusted via `fi_target_multiple`).

```
annual_expenses = expenses_monthly × 12

fi_target_wealth = annual_expenses × fi_target_multiple

fi_ratio = investable_wealth / fi_target_wealth   (cap conceptual ratio at 1.5 for scoring)

fi_score = clamp(fi_ratio / 1.0 × 100, 0, 100)
```

Interpretation:

| FI Score | Meaning |
|----------|---------|
| 0–25 | Early accumulation |
| 26–50 | Building momentum |
| 51–75 | Approaching independence |
| 76–100 | Near or at FI target |

Optional penalty (v2): reduce score by 5–15 points if emergency fund < 3 × `expenses_monthly`.

#### Step 5 — Wealth Velocity Score (0–100)

Combines **savings contribution** and **investment growth on existing corpus** into an annualized velocity, then scores relative to income scale.

```
annual_savings = monthly_savings × 12

annual_investment_growth = investable_wealth × (blended_return_pct / 100)

annual_wealth_velocity = annual_savings + annual_investment_growth

velocity_ratio = annual_wealth_velocity / max(total_income_monthly × 12, 1)

wealth_velocity_score = clamp(velocity_ratio × 50, 0, 100)
```

The multiplier `50` maps a velocity ratio of 2.0 (wealth grows at 2× salary per year) to score 100. Tunable constant in `wealth_profile`.

Secondary signal stored for UI (not part of 0–100 score):

```
velocity_inr_per_month = annual_wealth_velocity / 12
```

#### Step 6 — Time to milestone (₹1Cr / ₹5Cr / ₹10Cr)

Monthly simulation until `net_worth >= milestone_inr`. Horizons: results reported at **12, 36, 60, 120 months** checkpoints and as **months-to-hit** when milestone is reached within 600 months (50 years); otherwise `null`.

**State variables** (month `t = 0 … T`):

```
NW_0 = current_net_worth
income_t = total_income_monthly × (1 + salary_growth_monthly)^t
expenses_t = expenses_monthly × (1 + inflation_monthly)^t
savings_t = income_t - expenses_t
portfolio_t = investable_wealth at start of month (excludes emergency fund growth in base case)
```

Monthly growth factors:

```
salary_growth_monthly = (1 + salary_growth_pct/100)^(1/12) - 1
inflation_monthly     = (1 + inflation_pct/100)^(1/12) - 1
return_monthly(r)     = (1 + r/100)^(1/12) - 1
```

**Base scenario** loop per month:

```
portfolio_{t+1} = portfolio_t × (1 + return_monthly(blended_return_pct)) + savings_t
NW_{t+1} = emergency_fund + portfolio_{t+1}   // emergency fund static in base case
```

**Pessimistic scenario** adjustments:

- `blended_return_pct - 3`
- `salary_growth_pct - 2`
- `savings_t × 0.9` (slippage)

**Optimistic scenario** adjustments:

- `blended_return_pct + 2`
- `salary_growth_pct + 3`
- side income grows at `salary_growth_pct + 5`

For each milestone `M ∈ {1Cr, 5Cr, 10Cr}`:

```
months_to_M[scenario] = min { t : NW_t >= M }  or null if not reached by month 600
```

If `NW_0 >= M`: `months_to_M = 0`, `already_achieved = true`.

#### Output payload shape

```json
{
  "net_worth_inr": 4200000,
  "fi_score": 34.5,
  "wealth_velocity_score": 41.2,
  "velocity_inr_per_month": 185000,
  "savings_rate_pct": 38.0,
  "blended_return_pct": 10.2,
  "milestones": {
    "10000000": {
      "pessimistic": { "months": 28, "projected_date": "2028-10-01" },
      "base":        { "months": 22, "projected_date": "2028-04-01" },
      "optimistic":  { "months": 18, "projected_date": "2027-12-01" },
      "already_achieved": false
    },
    "50000000": { "...": "..." },
    "100000000": { "...": "..." }
  },
  "checkpoints": {
    "12":  { "base_nw_inr": 5100000 },
    "36":  { "base_nw_inr": 9200000 },
    "60":  { "base_nw_inr": 14500000 },
    "120": { "base_nw_inr": 32000000 }
  }
}
```

---

### 6.4 Aggregation logic

Aggregation runs in three layers: **source adapters → canonical holdings → Wealth Engine compute**.

#### Layer 1 — Source adapters

Each existing dashboard exposes a read-only adapter that maps its payload to partial Wealth Engine inputs.

| Source | Maps to | Aggregation rule |
|--------|---------|------------------|
| Account Statement Analyzer | `expenses_monthly`, optional `salary` hint | `expenses = avg(debit totals last 3 months)` |
| Wealth Distribution | `emergency_fund` hint, `net_worth` cross-check | emergency segment midpoint ₹ |
| MF Analyzer | `mutual_funds` | `Σ holding.current_value` |
| Stock Analyzer | `equity_investments` | `Σ holding.market_value` |
| CAS import | `mutual_funds`, `equity`, `bonds`, `fds` | split by `asset_class` from parser |
| Manual form | any field | user value wins if `source_priority = manual` |

**Conflict resolution (same asset class, multiple sources):**

```
1. manual (explicit user override)     — highest priority
2. cas_import (authoritative registry)
3. mf_analyzer / stock_analyzer
4. wealth_distribution hint            — lowest
```

When merging, emit `wealth.asset.merged` event with `{ asset_class, chosen_source, discarded_sources, delta_inr }`.

#### Layer 2 — Canonical snapshot builder

```
function buildWealthSnapshot(user_id, trigger):
  salary          = resolveIncome('salary', user_id)
  side_income     = resolveIncome('side_income', user_id)
  expenses        = resolveExpenses(user_id)
  assets          = mergeAssets(user_id)   // per-class conflict rules above
  liabilities     = resolveLiabilities(user_id)  // v2
  completeness    = scoreCompleteness(assets, salary, expenses)
  return WealthSnapshot(inputs, completeness, trigger)
```

**Data completeness score** (0–1):

| Field | Weight |
|-------|--------|
| salary | 0.15 |
| expenses | 0.15 |
| emergency_fund | 0.10 |
| equity + MF | 0.25 |
| bonds + FDs | 0.15 |
| crypto + startup_equity | 0.10 |
| side_income | 0.10 |

Field counts as present if value > 0 or explicitly set to 0 by user (not missing).

#### Layer 3 — Compute and persist

```
function aggregateAndCompute(user_id, trigger_event):
  snapshot = buildWealthSnapshot(user_id, trigger)
  metrics  = WealthEngine.compute(snapshot.inputs, profile.assumptions)
  milestones = WealthEngine.projectMilestones(metrics, [1e7, 5e7, 1e8])
  persist(snapshot, metrics, milestones)
  emit('wealth.metrics.computed', { snapshot_id, metrics, milestones })
  return { snapshot, metrics, milestones }
```

`NorthStarEngine` consumes `metrics` and `milestones` for path ranking — it does not recompute NW or time-to-1Cr.

#### Aggregation flow

```
Dashboard import / manual save
  → adapter extracts partial inputs
  → merge into canonical holdings (conflict resolution)
  → buildWealthSnapshot()
  → WealthEngine.compute()
  → store wealth_metrics + milestone_projections
  → publish wealth.metrics.computed
  → NorthStarEngine (optional) refreshes path rank
  → client UI updates
```

---

### 6.5 Event-driven architecture

Wealth metrics are **derived state**. Inputs change via discrete events; consumers react asynchronously. v1 can use in-process dispatch; v2 uses a queue (Redis / SQS).

#### Event catalog

| Event type | Trigger | Payload (summary) | Downstream action |
|------------|---------|-------------------|-------------------|
| `wealth.input.manual_updated` | User edits North Star form | `{ field, value_inr }` | Rebuild snapshot → recompute |
| `wealth.income.updated` | Salary / side income change | `{ stream_type, amount }` | Rebuild → recompute |
| `wealth.asset.updated` | Single asset class edit | `{ asset_class, value_inr }` | Merge → recompute |
| `wealth.import.mf_completed` | MF Analyzer upload | `{ holdings[], total_inr }` | Adapter → merge MF → recompute |
| `wealth.import.stock_completed` | Stock Analyzer upload | `{ holdings[], total_inr }` | Adapter → merge equity → recompute |
| `wealth.import.cas_completed` | CAS parse done | `{ by_asset_class{} }` | Multi-class merge → recompute |
| `wealth.import.account_completed` | Bank PDF analyzed | `{ avg_expenses }` | Update expenses → recompute |
| `wealth.asset.merged` | Conflict resolution | `{ asset_class, chosen_source }` | Audit log only |
| `wealth.metrics.computed` | Engine finished | `{ snapshot_id, metrics, milestones }` | UI refresh, North Star path rank, AI context cache |
| `wealth.milestone.achieved` | NW crosses threshold | `{ milestone_inr, snapshot_id }` | UI celebration, suggest next target |
| `wealth.snapshot.drift_detected` | Compare vs prior snapshot | `{ field, delta_pct }` | Drift badge on dashboard |

#### Processing pipeline

```
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Producers    │     │ Event bus    │     │ Consumers       │
│              │     │              │     │                 │
│ Manual form  │────►│              │────►│ SnapshotBuilder │
│ MF/Stock/CAS │────►│  wealth_*    │────►│ WealthEngine    │
│ Acct Analyzer│────►│  events      │────►│ MetricsStore    │
│              │     │              │────►│ NorthStarEngine │
│              │     │              │────►│ AI context cache│
└──────────────┘     └──────────────┘     └─────────────────┘
```

#### Handler contract

```
onEvent(event):
  1. Validate payload + idempotency_key (skip duplicates)
  2. Append to wealth_events (status = pending)
  3. Run aggregateAndCompute(user_id, event)
  4. Mark event processed_at
  5. Emit wealth.metrics.computed
  6. On failure: status = failed, retry with backoff (max 3)
```

**Idempotency:** Import events include `idempotency_key = hash(source + file_id + as_of_date)`. Duplicate uploads do not double-count.

#### v1 in-process implementation (current stack)

No external queue required initially:

| Component | Location | Role |
|-----------|----------|------|
| `WealthEventBus` | `server/services/wealth_event_bus.py` | Sync dispatch on API request |
| Producers | `main.py` endpoints + client `onSave` | Emit on upload / form save |
| Consumer | `wealth_engine.py` | `handle_wealth_event()` |

Client-side mirror: after `wealth.metrics.computed` response, write `north-star-metrics-v1` to `sessionStorage` and dispatch a custom DOM event `north-star:metrics-updated` for chart components.

#### API endpoints (Wealth Engine)

| Endpoint | Role |
|----------|------|
| `POST /wealth/compute` | Accept full input JSON; return metrics + milestones (stateless) |
| `POST /wealth/events` | Ingest event; run pipeline; return updated metrics |
| `GET /wealth/metrics/latest` | Requires DB (Phase 3); returns last snapshot |

`POST /compute-north-star` internally calls `POST /wealth/compute` first, then path ranking.

---

### 6.6 Integration with North Star Mode

| North Star UI section | Wealth Engine output |
|-----------------------|----------------------|
| North Star Header (progress ring) | `net_worth_inr`, milestone gap |
| Financial Snapshot | raw inputs + `data_completeness` |
| Path Ranker | `milestones` + velocity; paths use same simulation assumptions |
| Milestone Timeline | `checkpoints` at 12 / 36 / 60 / 120 months |
| Lever Board | sensitivity derived from `savings_rate`, `blended_return_pct` |
| AI Strategic Advisor | full `wealth_metrics` JSON in prompt context |

---

## 7. Wealth Simulation Engine

The **Wealth Simulation Engine** runs forward-looking **what-if scenarios** from the user's current financial state (Wealth Engine §6). It answers: *"If I take path A vs B vs C, what happens to my net worth, cash flow, risk, and odds of success over 1, 3, 5, and 10 years?"*

Pure deterministic math in v1; optional Monte Carlo overlay in Phase 4.

### 7.1 Role and relationship to Wealth Engine

```
Wealth Engine (t = 0)              Wealth Simulation Engine (t = 1…120 months)
─────────────────────              ─────────────────────────────────────────────
Current NW, FI, velocity    ───►   Scenario A–F monthly loops
Milestone ETAs (baseline)   ───►   Horizon checkpoints: 12, 36, 60, 120 mo
Blended return, savings     ───►   Per-scenario income / allocation overrides
                                   │
                                   ▼
                            ScenarioResult[] ───► NorthStarEngine path rank
                                                  AI narrative context
```

| Layer | Question it answers |
|-------|-------------------|
| Wealth Engine | Where am I today? When do I hit ₹1Cr on current trajectory? |
| Wealth Simulation Engine | What if I switch jobs / start a company / invest aggressively? |
| NorthStarEngine | Which scenario is the fastest **realistic** path to my North Star? |

---

### 7.2 Scenarios A–F

Each scenario is a **declarative config** (`server/config/simulation_scenarios.json`) applied to the same `t=0` snapshot. User can override key levers in the UI (e.g. job-switch raise %, SaaS runway months).

#### Scenario summary

| ID | Name | Primary lever | Income pattern | Allocation shift | Base P(success) |
|----|------|---------------|----------------|------------------|-----------------|
| **A** | Continue current career | Status quo | Salary grows at `salary_growth_pct` | No change | 88% |
| **B** | Job switch (higher salary) | +25% salary (configurable) | 2-month income gap, then higher salary | No change | 72% |
| **C** | Launch SaaS startup | Equity upside | 0 salary × 18 mo; ramp from M19 | +10% equity; deploy ₹5L seed | 32% |
| **D** | Launch AI consulting agency | Services revenue | 50% salary × 6 mo; consulting ramps | No change; low capex | 58% |
| **E** | Aggressive stock investing | Return / vol | Same as A | 70% equity / 20% MF / 10% debt | 55% |
| **F** | Balanced investing | Risk-adjusted growth | Same as A | 40% equity / 40% MF / 20% debt | 82% |

#### Scenario A — Continue current career (baseline)

| Parameter | Value |
|-----------|-------|
| `salary_multiplier` | 1.0 |
| `income_gap_months` | 0 |
| `extra_monthly_burn` | 0 |
| `one_time_cost` | 0 |
| `allocation_override` | null (use current weights) |
| `return_adjustment_pct` | 0 |

Serves as the **control scenario** — all other scenarios compare against A.

#### Scenario B — Increase salary by switching jobs

| Parameter | Default | Notes |
|-----------|---------|-------|
| `salary_multiplier` | 1.25 | +25% from month 3 onward |
| `income_gap_months` | 2 | Zero salary months 1–2 (job search / notice) |
| `one_time_cost` | ₹50,000 | Interview, relocation |
| `salary_growth_pct` | +2% vs profile | Faster band progression |
| `extra_monthly_burn` | 0 | |

#### Scenario C — Launch SaaS startup

| Parameter | Default | Notes |
|-----------|---------|-------|
| `salary_multiplier` | 0 for 18 mo → ramp | Founder draw ₹0–₹50K/mo optional |
| `revenue_ramp` | see below | MRR model from month 19 |
| `one_time_cost` | ₹5,00,000 | Incorporation, infra, legal |
| `extra_monthly_burn` | ₹80,000 | Burn on top of personal expenses |
| `allocation_override` | +10% equity vs current | Less liquid during build |
| `exit_upside_inr` | ₹0 base / ₹50L optimistic | Optional liquidity event at Y5 |

**Revenue ramp (base case, from launch month):**

```
MRR_m = min(mrr_cap, mrr_initial × (1 + mrr_growth_monthly)^m)
mrr_initial = ₹25,000
mrr_growth_monthly = 12%
mrr_cap = ₹8,00,000
founder_take_pct = 0.6        // after costs
```

#### Scenario D — Launch AI consulting agency

| Parameter | Default | Notes |
|-----------|---------|-------|
| `salary_multiplier` | 0.5 for 6 mo → 1.0 | Part-time transition |
| `consulting_revenue_ramp` | From month 4 | Faster than SaaS |
| `one_time_cost` | ₹1,00,000 | Website, tooling |
| `extra_monthly_burn` | ₹20,000 | |
| `billable_rate_inr` | ₹4,000/hr | |
| `billable_hours_month` | 40 → 120 over 24 mo | |

```
consulting_income_m = min(hours_cap, hours_m) × billable_rate × utilization_pct
utilization_pct = 0.7
```

#### Scenario E — Aggressive stock investing

| Parameter | Default | Notes |
|-----------|---------|-------|
| Income | Same as A | No career change |
| `allocation_override` | 70% equity, 20% MF, 10% debt/FD | Rebalance at t=0 |
| `blended_return_pct` | +3% vs baseline | Higher expected return |
| `return_volatility_pct` | 22% | Used for risk score + P(success) |
| `max_drawdown_assumption_pct` | 35% | Stress in pessimistic band |

#### Scenario F — Balanced investing

| Parameter | Default | Notes |
|-----------|---------|-------|
| Income | Same as A | No career change |
| `allocation_override` | 40% equity, 40% MF, 20% debt/FD | |
| `blended_return_pct` | baseline | |
| `return_volatility_pct` | 12% | Lower vol |
| `max_drawdown_assumption_pct` | 15% | |

---

### 7.3 Architecture

#### Component diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                         North Star Dashboard                            │
│  Scenario comparison table │ NW charts │ Cash flow │ Risk │ P(success) │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ POST /wealth/simulate
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      wealth_simulation_engine.py                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Scenario    │  │ Monthly      │  │ Risk        │  │ Probability  │ │
│  │ Registry    │──│ Simulator    │──│ Scorer      │──│ Estimator    │ │
│  │ (A–F config)│  │ (12–120 mo)  │  │             │  │              │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────┘ │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ reads t=0
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         wealth_engine.py                                │
│  NorthStarSnapshot │ wealth_metrics │ blended_return │ savings_rate      │
└────────────────────────────────────────────────────────────────────────┘
```

#### Module responsibilities

| Module | File | Responsibility |
|--------|------|----------------|
| Scenario Registry | `server/config/simulation_scenarios.json` | Default parameters for A–F |
| Scenario Loader | `wealth_simulation_engine.py` | Merge user overrides onto defaults |
| Monthly Simulator | `wealth_simulation_engine.py` | Month loop: income, expenses, portfolio, NW |
| Risk Scorer | `wealth_simulation_engine.py` | Composite 0–100 risk per horizon |
| Probability Estimator | `wealth_simulation_engine.py` | P(success) per scenario per horizon |
| Orchestrator | `wealth_simulation_engine.py` | `run_all_scenarios(snapshot, metrics)` |
| Path Ranker input | `north_star_engine.py` | Rank scenarios by speed × P(success) ÷ risk |

#### Database extension (Phase 3)

Add to §6.2 schema:

#### `simulation_runs`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| snapshot_id | UUID FK → wealth_snapshots | t=0 state |
| scenario_id | ENUM | `A`…`F` |
| band | ENUM | `pessimistic`, `base`, `optimistic` |
| horizons_json | JSONB | checkpoints at 12, 36, 60, 120 |
| risk_scores_json | JSONB | per horizon |
| probability_success_pct | NUMERIC(5,2) | per horizon |
| created_at | TIMESTAMPTZ | |

**v1 sessionStorage:** `north-star-simulation-v1`

---

### 7.4 Simulation logic

#### 7.4.1 Shared monthly loop

All scenarios use the same loop structure; only **scenario config** changes inputs per month.

**Initialization (month 0):**

```
NW_0           = wealth_metrics.net_worth_inr
portfolio_0    = wealth_metrics.investable_wealth_inr
emergency_0    = inputs.emergency_fund
cash_0         = emergency_0                    // liquid buffer
expenses_base  = inputs.expenses_monthly
salary_base    = inputs.salary_monthly
side_base      = inputs.side_income_monthly
allocation     = scenario.allocation_override ?? current_allocation_weights
blended_r      = scenario.blended_return ?? wealth_metrics.blended_return_pct
```

**For each month `t = 1 … 120`:**

```
// ── Income ──
gap_active     = t <= scenario.income_gap_months
salary_t       = 0 if gap_active else salary_base × scenario.salary_multiplier
                 × (1 + salary_growth_monthly)^(t - gap_active)
side_t         = side_base × (1 + side_growth_monthly)^t
business_t     = scenario.business_revenue(t)      // C, D only; else 0
income_t       = salary_t + side_t + business_t

// ── Expenses & cash flow ──
expenses_t     = expenses_base × (1 + inflation_monthly)^t
burn_t         = scenario.extra_monthly_burn(t)
one_time_t     = scenario.one_time_cost if t == 1 else 0
outflow_t      = expenses_t + burn_t + one_time_t
net_cashflow_t = income_t - outflow_t

// ── Savings allocation ──
// Negative cashflow draws from emergency fund first, then portfolio (penalized)
if net_cashflow_t >= 0:
  investable_contribution_t = net_cashflow_t × savings_deploy_pct   // default 0.85
  cash_t                    = cash_{t-1} + net_cashflow_t - investable_contribution_t
else:
  shortfall = abs(net_cashflow_t)
  cash_t, portfolio_draw = draw_from_liquidity(cash_{t-1}, portfolio_{t-1}, shortfall)
  investable_contribution_t = -portfolio_draw

// ── Portfolio growth ──
portfolio_t = (portfolio_{t-1} + investable_contribution_t)
              × (1 + return_monthly(blended_r_band))

// ── Optional rebalancing (E, F at t=1 only) ──
// allocation_override applied at t=1; thereafter drift with contributions

// ── Net worth ──
NW_t = cash_t + portfolio_t + illiquid_startup_equity_t   // C optimistic exit adds here

// ── Record series ──
cashflow_series[t] = net_cashflow_t
nw_series[t]       = NW_t
```

**Scenario bands** (run loop 3× per scenario):

| Band | Return adj | Income adj | Burn adj |
|------|------------|------------|----------|
| Pessimistic | `blended_r - 3` | `× 0.9` | `× 1.15` |
| Base | as config | as config | as config |
| Optimistic | `blended_r + 2` | `× 1.1` | `× 0.85` |

#### 7.4.2 Horizon checkpoints

After the loop, extract values at **12, 36, 60, 120** months for each band:

```
checkpoint(h) = {
  month: h,
  net_worth_inr: nw_series[h],
  cumulative_cashflow_inr: sum(cashflow_series[1..h]),
  monthly_cashflow_inr: cashflow_series[h],
  emergency_fund_inr: cash_series[h],
  portfolio_inr: portfolio_series[h]
}
```

#### 7.4.3 Risk score (0–100)

Composite score **per scenario per horizon** — higher = riskier.

```
risk_score = clamp(
  0.30 × income_volatility_risk +
  0.25 × allocation_risk +
  0.20 × liquidity_risk +
  0.15 × cashflow_stress_risk +
  0.10 × concentration_risk,
  0, 100
)
```

| Component | Formula | Notes |
|-----------|---------|-------|
| `income_volatility_risk` | `scenario.base_income_risk` × decay factor | A=10, B=35, C=85, D=55, E=15, F=10 |
| `allocation_risk` | `equity_weight × 0.8 + crypto_weight × 1.0` × 100 | E scores highest |
| `liquidity_risk` | `clamp(100 - (cash_h / expenses_h) / 6 × 100, 0, 100)` | Months of expenses in cash |
| `cashflow_stress_risk` | `% of months with negative cashflow` × 100 | High for C |
| `concentration_risk` | `max(asset_class_weight) × 100` | Single-asset dominance |

**Decay factor** — income risk reduces if scenario stabilizes by horizon `h`:

```
decay = max(0.3, 1 - h / 120)   for scenarios with revenue ramp
```

#### 7.4.4 Probability of success (0–100%)

**Definition of success** (configurable; default):

> At horizon `h`, scenario is successful if **all** of:
> 1. `NW_h >= NW_h_scenario_A × success_nw_threshold` (default 0.95 — within 5% of baseline)
> 2. `cash_h >= 3 × expenses_h` (emergency buffer intact)
> 3. `cumulative_cashflow[1..h] >= -max_drawdown_inr` (default ₹10L cumulative deficit cap)

For **startup scenarios (C, D)**, add alternate success path:

> **OR** `business_mrr_h >= expenses_h × 1.2` (business covers personal expenses)

**v1 deterministic P(success):**

```
P_success_base = scenario.prior_success_pct     // from table §7.2

// Adjustments from simulated base-band outcome
nw_ratio    = NW_h_base / max(NW_h_scenario_A, 1)
cash_months = cash_h / expenses_h
cf_health   = 1 if cumulative_cashflow >= -max_drawdown else 0

score_adj = (
  0.40 × clamp(nw_ratio, 0, 1.2) +
  0.35 × clamp(cash_months / 6, 0, 1) +
  0.25 × cf_health
)

P_success = clamp(P_success_base × score_adj, 5, 95)
```

**Cross-scenario comparison:** use **base band** at **60-month** horizon as the primary ranking input unless user selects a different horizon in UI.

#### 7.4.5 Scenario-specific logic notes

**B — Job switch:** Months 1–2 `income = 0`; month 3+ salary × 1.25. One-time cost at t=1. P(success) penalized if emergency fund cannot cover gap:

```
if emergency_0 < (expenses_base × income_gap_months + one_time_cost):
  P_success -= 15
```

**C — SaaS:** Months 1–18 negative cashflow from burn. Portfolio draw triggers `liquidity_risk` spike. Optimistic band may add `exit_upside_inr` at month 60. P(success) uses low prior (32%) unless MRR covers expenses by month 36.

**D — AI consulting:** Shorter income dip (6 mo at 50% salary). Revenue ramp from month 4. Higher P(success) than C due to lower burn and faster monetization.

**E — Aggressive investing:** Apply `allocation_override` at t=1. Pessimistic band applies `max_drawdown_assumption_pct` once at a stress month (e.g. month 18):

```
portfolio_t *= (1 - max_drawdown_assumption_pct / 100)   // one-time stress event
```

**F — Balanced:** Control for allocation risk; P(success) near A but NW growth slightly lower at 10Y vs E.

#### 7.4.6 Simulation orchestration

```
function run_all_scenarios(snapshot, wealth_metrics, overrides?):
  results = []
  baseline_A = simulate('A', snapshot, wealth_metrics, 'base')

  for scenario_id in ['A','B','C','D','E','F']:
    config = loadScenario(scenario_id, overrides)
    bands = {}
    for band in ['pessimistic','base','optimistic']:
      series = monthly_loop(config, band, snapshot, wealth_metrics)
      bands[band] = {
        checkpoints: extract_checkpoints(series, [12,36,60,120]),
        risk_scores: compute_risk(series, config, [12,36,60,120]),
      }
    bands.base.probability_success = compute_probability(
      bands, baseline_A, config, horizon=60
    )
    results.append({ scenario_id, config, bands })

  return rank_scenarios(results)    // → NorthStarEngine
```

#### 7.4.7 Ranking formula (feeds Path Ranker)

```
realism_score = probability_success_pct / 100
speed_score   = clamp(NW_60_base / NW_60_scenario_A_base, 0, 2) / 2
risk_penalty  = risk_score_60 / 100

path_score = (0.45 × speed_score + 0.40 × realism_score) × (1 - 0.25 × risk_penalty)
```

Scenarios sorted by `path_score` descending. Scenario C may rank high on speed but low on realism — net position reflects **fastest realistic** path.

---

### 7.5 Output schema

```json
{
  "simulation_id": "uuid",
  "snapshot_at": "2026-06-10T00:00:00Z",
  "horizons_months": [12, 36, 60, 120],
  "scenarios": [
    {
      "id": "B",
      "name": "Job switch (higher salary)",
      "bands": {
        "base": {
          "checkpoints": {
            "12": {
              "net_worth_inr": 5800000,
              "cumulative_cashflow_inr": 420000,
              "monthly_cashflow_inr": 85000,
              "emergency_fund_inr": 900000,
              "portfolio_inr": 4900000
            },
            "36": { "..." : "..." },
            "60": { "..." : "..." },
            "120": { "..." : "..." }
          },
          "risk_scores": { "12": 38, "36": 32, "60": 28, "120": 25 },
          "probability_success_pct": { "12": 68, "36": 74, "60": 78, "120": 80 }
        },
        "pessimistic": { "..." : "..." },
        "optimistic": { "..." : "..." }
      },
      "path_score": 0.71,
      "rank": 2
    }
  ],
  "baseline_scenario_id": "A",
  "recommended_scenario_id": "B",
  "disclaimer": "Projections are illustrative, not investment advice."
}
```

#### UI mapping

| UI component | Simulation output |
|--------------|-------------------|
| Scenario comparison table | All scenarios × horizons (NW, cash flow, risk, P) |
| NW growth chart | `checkpoints[*].net_worth_inr` lines per scenario |
| Cash flow chart | `monthly_cashflow_inr` + cumulative |
| Risk heatmap | `risk_scores` across scenarios × horizons |
| Path Ranker (§2.3) | `path_score`, `rank` |
| Milestone Timeline (§2.4) | Overlay scenario A vs recommended on 10Y curve |

---

### 7.6 API and integration

#### Endpoints

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /wealth/simulate` | `{ snapshot, wealth_metrics, scenario_ids?, overrides? }` | Full `SimulationResult` |
| `POST /wealth/simulate/scenario` | Single scenario + band | One scenario series (for drill-down charts) |

`POST /compute-north-star` pipeline:

```
1. POST /wealth/compute          → wealth_metrics
2. POST /wealth/simulate         → scenario results
3. north_star_engine.rank_paths  → Path Ranker payload
4. (optional) POST /analyze-north-star-ai
```

#### Event integration (extends §6.5)

| Event | Action |
|-------|--------|
| `wealth.metrics.computed` | Trigger `wealth.simulation.requested` |
| `wealth.simulation.completed` | Cache `north-star-simulation-v1`; refresh Path Ranker UI |
| `wealth.input.manual_updated` | Debounce 500ms → recompute metrics → re-simulate |

#### v1 client flow

```
User opens North Star → load inputs from sessionStorage
  → POST /wealth/compute
  → POST /wealth/simulate (all A–F)
  → render comparison table + charts
  → user selects scenario → AI Ask tab uses that scenario's payload
```

---

## 8. North Star Recommendation Engine

The **Recommendation Engine** turns Wealth Engine state, simulation results, market regime, career profile, and startup opportunities into a **ranked action list** — ordered by expected net-worth growth over **1, 3, and 5 years**.

It answers: *"What should I do next to grow wealth fastest — realistically?"*

**Principle:** Scores are deterministic. AI (§2.7) narrates recommendations; it does not assign ranks.

### 8.1 Role in the stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    Recommendation Engine                         │
│  Rank: Invest | Save | Startup | Upskill | Job | Div | Conc     │
└────────────────────────────▲────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     │                       │                       │
     ▼                       ▼                       ▼
Wealth Engine          Simulation Engine       External context
(NW, portfolio,        (scenarios A–F,         (market regime,
 savings, FI)           NW deltas 1–10Y)        career, startups)
     │                       │                       │
     └───────────────────────┴───────────────────────┘
                             │
              Optional: Investment Copilot signals
              (Diversify / Concentrate / Invest more)
              Market data ingestion (regime, volatility)
```

| Engine | Question |
|--------|----------|
| Wealth Engine (§6) | Where am I today? |
| Simulation Engine (§7) | What life path wins in each scenario? |
| **Recommendation Engine (§8)** | **Which discrete action should I take next?** |
| NorthStarEngine | Orchestrates payload for UI + AI |

**Mapping: Simulation scenarios → Recommendation actions**

| Simulation | Primary action(s) |
|------------|-------------------|
| A — Continue career | Save more, Invest more (baseline) |
| B — Job switch | **Switch job**, Upskill |
| C — SaaS startup | **Build startup** |
| D — AI consulting | **Build startup** (services variant) |
| E — Aggressive investing | **Invest more**, Concentrate capital |
| F — Balanced investing | Invest more, Diversify |

---

### 8.2 Inputs and actions

#### Inputs

| Input | Source | Key fields |
|-------|--------|------------|
| **Net worth** | Wealth Engine §6 | `net_worth_inr`, `investable_wealth_inr`, `emergency_fund_months` |
| **Portfolio** | CAS / MF / Stock / manual | Asset class weights, concentration (top1, top3, HHI), equity % |
| **Market conditions** | Market data ingestion | `regime` (bull/bear/sideways), `index_return_3m`, `volatility_pct`, `equity_risk_premium` |
| **Career profile** | Manual North Star form | `role`, `years_experience`, `salary_inr`, `salary_vs_market_pct`, `skill_demand_score` (0–100), `upskill_readiness` |
| **Startup opportunities** | **Startup Opportunity Engine** (§9) | `ideas[]`: ranked by `wealth_creation_score`; feeds `build_startup` scorer |

Normalized bundle: `RecommendationContext` (Pydantic / TypeScript mirror).

#### Actions (7)

| ID | Action | Description |
|----|--------|-------------|
| `invest_more` | **Invest more** | Increase deployable capital into growth assets (equity/MF) |
| `save_more` | **Save more** | Raise savings rate; cut discretionary spend |
| `build_startup` | **Build startup** | Found SaaS, agency, or side business (C/D paths) |
| `upskill` | **Upskill** | Courses, certifications, projects → higher future income |
| `switch_job` | **Switch job** | Change employer for comp / trajectory (B path) |
| `diversify` | **Diversify** | Reduce concentration and single-name risk |
| `concentrate_capital` | **Concentrate capital** | High-conviction sizing in best ideas (within risk bounds) |

---

### 8.3 Architecture

#### Component diagram

```
server/services/recommendation_engine/
  __init__.py
  models.py                 # RecommendationContext, ActionScore, RankedAction
  context_builder.py        # merge Wealth + Simulation + market + career + startup
  scorers/
    base.py                 # ActionScorer protocol
    invest_more.py
    save_more.py
    build_startup.py
    upskill.py
    switch_job.py
    diversify.py
    concentrate.py
  aggregator.py             # horizon weights → composite score
  ranker.py                 # sort + conflict resolution
  reasoning.py              # evidence chain per action
  orchestrator.py           # RecommendationEngine.run(context)
```

#### Orchestrator flow

```
RecommendationContext
  → for each action in ACTIONS:
       score_12m, score_36m, score_60m = ActionScorer.score(context, horizons)
       expected_nw_delta = marginal NW delta from Simulation / sensitivity
       feasibility = gating checks (EF, age, data completeness)
       confidence = f(data_coverage, simulation_P_success, score_dispersion)
       reasoning_chain = ReasoningBuilder.build(...)
  → Aggregator.composite(scores, horizon_weights)
  → Ranker.sort + resolve_conflicts(diversify, concentrate)
  → RankedRecommendationList
```

#### Dependencies

| Module | Provides to Recommendation Engine |
|--------|-----------------------------------|
| `wealth_engine.py` | NW, savings rate, FI score, milestone gaps, sensitivities |
| `wealth_simulation_engine.py` | Scenario NW at 12/36/60 mo; `path_score`; P(success) |
| `market_data_ingestion` / `MarketDataService` | Regime, volatility, index returns |
| `investment_copilot` (optional) | Buy/Reduce signals → invest / diversify / concentrate |
| `recommendation_engine` | **Output** → North Star UI §2.5, AI context |

#### File entrypoint

`server/services/recommendation_engine.py` — `RecommendationEngine.recommend(context) -> RecommendationResult`

---

### 8.4 Scoring algorithms

Each action produces per-horizon scores in **0–100** plus **expected NW delta (INR)** at that horizon.

**Shared notation**

```
h ∈ {12, 36, 60}   // months (1Y, 3Y, 5Y)
EF_mo = emergency_fund_inr / expenses_monthly
SR    = savings_rate_pct / 100
NW_h  = projected net worth at horizon h (base simulation band)
NW_h^A = baseline (Scenario A) net worth at h
ΔNW_h(action) = NW_h(action) - NW_h^A   // marginal uplift vs status quo
```

**Composite action score at horizon h:**

```
raw_score_h = clamp(
  0.50 × impact_h +
  0.30 × feasibility_h +
  0.20 × urgency_h,
  0, 100
)

impact_h     = normalize(ΔNW_h, 0, impact_cap_inr) × 100
feasibility_h = action-specific gates (0–100)
urgency_h    = action-specific time-sensitivity (0–100)
```

`impact_cap_inr` default: ₹50L at 3Y (configurable by NW tier).

---

#### 8.4.1 Invest more

**When it wins:** Adequate emergency fund, positive savings flow, market not extremely euphoric, portfolio underweight growth.

```
feasibility = clamp(
  0.35 × min(EF_mo / 6, 1) × 100 +
  0.35 × min(SR / 0.25, 1) × 100 +
  0.30 × (100 - overvaluation_penalty),
  0, 100
)

overvaluation_penalty = clamp((index_return_3m - 0.15) × 200, 0, 40)   // hot market

urgency = clamp((target_equity_pct - current_equity_pct) × 2, 0, 100)

ΔNW_h ≈ WealthEngine.sensitivity(equity_allocation +5%, horizon=h)
      or Simulation E/F delta vs A at h
```

| Market regime | Score adjustment |
|---------------|------------------|
| bull | +5 impact if fundamentals OK |
| bear | +10 urgency (buy dip) if EF ≥ 9 mo |
| sideways | neutral |

---

#### 8.4.2 Save more

**When it wins:** Low savings rate, thin emergency fund, high income stability, milestone gap large.

```
feasibility = clamp(
  0.50 × (1 - min(SR / 0.45, 1)) × 100 +    // more room to save
  0.50 × min(income_stability_score, 100),
  0, 100
)

urgency = clamp(
  0.60 × max(0, (0.35 - SR) / 0.35) × 100 +  // SR below 35%
  0.40 × max(0, (6 - EF_mo) / 6) × 100,
  0, 100
)

ΔNW_h ≈ sensitivity(savings_rate +10%, horizon=h)
```

Caps: if `SR ≥ 55%`, `feasibility` max 40 (diminishing returns).

---

#### 8.4.3 Build startup

**When it wins:** Strong `startup_opportunities`, adequate runway, founder fit, simulation C/D `path_score` competitive.

```
best_idea = max(startup_opportunities, key=domain_fit × upside_weight)

feasibility = clamp(
  0.30 × best_idea.domain_fit +
  0.30 × min(EF_mo / 12, 1) × 100 +          // 12 mo EF ideal
  0.20 × min(runway_months / 18, 1) × 100 +
  0.20 × simulation_C_or_D.P_success_60m,
  0, 100
)

urgency = clamp(best_idea.domain_fit × 0.6 + (100 - career_satisfaction) × 0.4, 0, 100)

ΔNW_h = Simulation(C).NW_h_base - NW_h^A
      // or max(C, D) if both present
```

**Hard gate:** if `EF_mo < 6`, `feasibility = min(feasibility, 25)` — startup not advised without buffer.

---

#### 8.4.4 Upskill

**When it wins:** Salary below market, high skill demand, long career runway.

```
salary_gap = max(0, 1 - salary_vs_market_pct)    // 0.85 → gap 0.15

feasibility = clamp(
  0.40 × salary_gap × 100 +
  0.35 × skill_demand_score +
  0.25 × upskill_readiness,
  0, 100
)

urgency = clamp(years_to_mid_career_bonus × skill_demand_score / 100, 0, 100)

ΔNW_h = model income ramp:
  months 1-6:  -₹20K/mo (course cost)
  months 7-18: salary × (1 + 0.12) vs baseline
  feed into monthly simulator → NW_h
```

Correlates with **Switch job** but lower risk / longer payoff tail.

---

#### 8.4.5 Switch job

**When it wins:** Underpaid vs market, simulation B beats A on `path_score`, hiring market OK.

```
feasibility = clamp(
  0.40 × salary_gap × 100 +
  0.30 × simulation_B.P_success_60m +
  0.20 × (100 - job_market_stress) +
  0.10 × min(tenure_months / 18, 1) × 100,
  0, 100
)

urgency = clamp(salary_gap × 120 + milestone_gap_pressure, 0, 100)

ΔNW_h = Simulation(B).NW_h_base - NW_h^A
```

**Hard gate:** if `EF_mo < 3`, reduce feasibility by 30 (gap risk during switch).

---

#### 8.4.6 Diversify

**When it wins:** High concentration, Copilot Reduce signals, sector skew, simulation risk elevated.

```
HHI = Σ weight_i²   // portfolio concentration
concentration_score = clamp((HHI - 0.08) / 0.20 × 100, 0, 100)   // HHI > 0.08 → diversify

feasibility = clamp(
  0.40 × concentration_score +
  0.30 × top3_weight_pct / 80 × 100 +
  0.30 × copilot_reduce_ratio × 100,
  0, 100
)

urgency = concentration_score

ΔNW_h = risk_adjusted:
  // Lower variance → slightly lower expected NW but higher risk-adjusted utility
  ΔNW_h_nominal = Simulation(F).NW_h - Simulation(E).NW_h   // often small positive at 5Y
  impact_h = 0.7 × normalize(ΔNW_h_nominal) + 0.3 × risk_reduction_score
```

Diversify optimizes **risk-adjusted** growth, not raw max NW.

---

#### 8.4.7 Concentrate capital

**When it wins:** Few high-conviction Buy/Accumulate signals, portfolio too diversified for user's edge, high risk tolerance.

```
conviction = avg(confidence_score) for top copilot Buy/Accumulate symbols

feasibility = clamp(
  0.35 × conviction +
  0.25 × user_risk_tolerance +
  0.20 × (100 - concentration_score) +   // room to concentrate
  0.20 × min(EF_mo / 9, 1) × 100,
  0, 100
)

urgency = conviction × 0.8

ΔNW_h = Simulation(E).NW_h - Simulation(F).NW_h   // aggressive tilt uplift
```

**Hard gate:** if `top1_weight > 30%`, feasibility cap 30 (already concentrated).

---

### 8.5 Ranking and conflict resolution

#### Horizon-weighted composite

User-selectable profile (default **balanced**):

| Profile | W_1Y (12m) | W_3Y (36m) | W_5Y (60m) |
|---------|------------|------------|------------|
| near_term | 0.50 | 0.35 | 0.15 |
| balanced | 0.20 | 0.35 | 0.45 |
| long_term | 0.10 | 0.30 | 0.60 |

```
composite(action) = Σ_h  W_h × raw_score_h
```

#### Confidence per action

```
confidence = clamp(
  0.35 × data_completeness +
  0.35 × (1 - score_variance across horizons / 100) +
  0.30 × simulation_P_success (if action maps to scenario),
  20, 92
)
```

#### Mutual exclusion: Diversify vs Concentrate

```
if diversify.composite > 60 AND concentrate.composite > 60:
  if HHI > 0.15 OR top3 > 65%:
    concentrate.composite *= 0.5   // already concentrated
  elif conviction > 75 AND EF_mo >= 9:
    diversify.composite *= 0.6     // user has edge + buffer
  else:
    both.composite *= 0.85         // dampen both; prefer Save / Switch
```

#### Save vs Invest priority

```
if EF_mo < 6:
  boost save_more.urgency by +20
  cap invest_more.feasibility at 50
```

#### Final rank

```
actions_sorted = sort(ACTIONS, key=composite, descending=True)
assign rank 1..7
emit top 3 as "primary recommendations" in UI
```

---

### 8.6 Output schema and API

#### `RecommendationResult`

```json
{
  "computed_at": "2026-06-10T14:00:00Z",
  "horizon_profile": "balanced",
  "baseline_nw_inr": 4200000,
  "recommendations": [
    {
      "rank": 1,
      "action_id": "switch_job",
      "action_label": "Switch job",
      "composite_score": 78.2,
      "confidence_pct": 72,
      "horizons": {
        "12": { "score": 65, "expected_nw_delta_inr": 800000, "projected_nw_inr": 5000000 },
        "36": { "score": 82, "expected_nw_delta_inr": 4200000, "projected_nw_inr": 12500000 },
        "60": { "score": 76, "expected_nw_delta_inr": 9800000, "projected_nw_inr": 28000000 }
      },
      "linked_simulation": "B",
      "reasoning_chain": {
        "summary": "Salary 18% below market; Scenario B adds ₹42L vs baseline at 3Y.",
        "steps": [
          { "factor": "salary_gap", "finding": "salary_vs_market_pct = 0.82", "impact": "bullish" },
          { "factor": "simulation", "finding": "Scenario B path_score 0.71 vs A 0.52", "impact": "bullish" }
        ]
      },
      "prerequisites": ["Maintain 6+ months emergency fund during transition"],
      "risks": ["2-month income gap modelled in Scenario B"]
    }
  ],
  "suppressed_actions": [
    { "action_id": "concentrate_capital", "reason": "Top position already 28% of portfolio" }
  ],
  "disclaimer": "Illustrative projections, not personalized investment advice."
}
```

#### API endpoints

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /north-star/recommend` | `{ recommendation_context, horizon_profile? }` | `RecommendationResult` |
| `POST /compute-north-star` | Full North Star snapshot | Wealth + Simulation + **Recommendations** (unified payload) |

**Pipeline inside `POST /compute-north-star`:**

```
1. wealth_engine.compute(snapshot)
2. wealth_simulation_engine.run_all(snapshot, metrics)
3. recommendation_engine.recommend(context_builder.build(...))
4. north_star_engine.assemble_payload(...)
```

#### UI mapping (§2.5 Recommendation Board)

| Column | Field |
|--------|-------|
| Rank | `rank` |
| Action | `action_label` |
| Score | `composite_score` |
| 1Y / 3Y / 5Y impact | `horizons.12/36/60.expected_nw_delta_inr` |
| Confidence | `confidence_pct` |
| Why | `reasoning_chain.summary` + expand steps |

#### AI integration (§2.7)

`POST /analyze-north-star-ai` receives `recommendations[]` in payload. System prompt:

> "Recommendations are pre-ranked by the Recommendation Engine. Explain top 3 actions using only provided scores and deltas. Do not reorder or invent new actions."

#### v1 storage

| Key | Content |
|-----|---------|
| `north-star-recommendations-v1` | Last `RecommendationResult` in sessionStorage |

#### Event integration (extends §6.5)

| Event | Action |
|-------|--------|
| `wealth.simulation.completed` | Trigger `recommendation.requested` |
| `market.ingestion.completed` | Refresh market_conditions; re-recommend |
| `wealth.recommendations.computed` | UI badge update |
| `startup.opportunities.generated` | Refresh Recommendation `build_startup`; Simulation C/D params |

---

## 9. Startup Opportunity Engine

The **Startup Opportunity Engine** matches user skills to market openings across five verticals, generates concrete startup ideas with revenue projections and GTM roadmaps, and **ranks ideas by expected wealth creation potential** (founder cash + equity value over 5 years).

Feeds **Recommendation Engine** `build_startup` (§8.4.3) and **Simulation Engine** scenarios C/D (§7.2).

**Principle:** Idea generation and ranking are deterministic (template library + scoring). Optional LLM enriches descriptions only — never changes rank or revenue numbers.

### 9.1 Role in the stack

```
User skills + career profile
         │
         ▼
┌────────────────────────────────────┐
│   Startup Opportunity Engine       │
│   Scan: AI | Health | Markets | SaaS│
│   Generate ideas → rank by wealth    │
└──────────────┬─────────────────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
Simulation C/D   Recommendation      North Star UI
(revenue ramp)   build_startup       Startup Ideas panel
```

| Consumer | Uses |
|----------|------|
| Recommendation Engine §8 | `best_idea.domain_fit`, `upside_inr_5y`, `wealth_creation_score` |
| Simulation Engine §7 | `mrr_ramp`, `burn`, `time_to_revenue` per selected idea |
| AI Advisor §2.7 | Narrates top 3 ideas; cites engine numbers only |

---

### 9.2 Analysis domains

#### Inputs

| Input | Source | Fields |
|-------|--------|--------|
| **User skills** | North Star career form + optional resume tags | `skills[]`: `{ name, proficiency 1–5, years }`; `primary_domain` |
| **Market trends** | Config + market data ingestion (macro) | `trend_scores` by vertical; `index_return_12m`; `hiring_demand_index` |
| **Wealth context** | Wealth Engine §6 | `runway_months`, `EF_mo`, `salary_inr`, `side_income_inr` |
| **Risk appetite** | User preference | `risk_tolerance` 0–100 |

#### Vertical scanners (5)

| Vertical | What it analyzes | Example idea patterns |
|----------|------------------|------------------------|
| **AI opportunities** | LLM adoption curve, SMB automation gap, India AI services demand | AI ops agency, vertical copilot (legal/CA), workflow automation SaaS |
| **Healthcare opportunities** | Digital health growth, compliance burden, aging population | Clinic scheduling SaaS, claims assist, patient engagement tool |
| **Stock market opportunities** | Retail investor growth, data/tooling gaps, Copilot signals | India portfolio analytics SaaS, alert engine, research subscription |
| **SaaS opportunities** | B2B micro-SaaS, global from India, PLG templates | Niche workflow tool, API wrapper, industry vertical SaaS |
| **Market trends** (cross-cutting) | Macro sector momentum, regulatory tailwinds | Boosts/scores templates per vertical |

Each vertical is a **template library** (`server/config/startup_idea_templates.json`) plus a **trend multiplier** from `market_trends.json` (solo-dev maintainable, no paid API required).

---

### 9.3 Architecture

#### Component diagram

```
server/services/startup_opportunity_engine/
  __init__.py
  models.py                      # StartupIdea, SkillProfile, RevenueProjection
  skill_profiler.py              # normalize + vector match to templates
  trend_analyzer.py              # load trend_scores, apply vertical multipliers
  scanners/
    ai_scanner.py
    healthcare_scanner.py
    stock_market_scanner.py
    saas_scanner.py
    base_scanner.py
  idea_generator.py              # template × skill match → candidate ideas
  revenue_model.py               # MRR ramp, services, marketplace models
  difficulty_scorer.py
  skills_gap_analyzer.py
  gtm_roadmap_builder.py
  wealth_ranker.py               # wealth_creation_score
  orchestrator.py                # StartupOpportunityEngine.run(profile)
  analyze_startup_ai.py          # optional LLM polish (descriptions only)
```

#### Orchestrator flow

```
StartupProfile (skills, wealth context, risk)
  → SkillProfiler.match_templates()           // all verticals
  → TrendAnalyzer.apply_multipliers()
  → for each candidate idea:
       RevenueModel.project(idea, horizon=60mo)
       DifficultyScorer.score(idea, profile)
       SkillsGapAnalyzer.gap(idea, profile)
       GTMRoadmapBuilder.build(idea, profile)
       WealthRanker.score(idea, revenue, difficulty, profile)
  → sort by wealth_creation_score DESC
  → return top N (default 10, UI shows top 5)
```

#### Dependencies

| Module | Role |
|--------|------|
| Wealth Engine §6 | Runway, EF — gates unrealistic ideas |
| Market data ingestion | Macro trend inputs; sector momentum for stock-market vertical |
| Investment Copilot (optional) | “Tooling gap” signal for fintech/stock ideas |
| Recommendation / Simulation | Downstream consumers |

---

### 9.4 Idea generation and revenue projections

#### Template structure (`startup_idea_templates.json`)

```json
{
  "id": "ai_smb_automation_agency",
  "vertical": "ai",
  "title": "AI workflow automation for Indian SMBs",
  "required_skills": ["python", "sales", "prompt_engineering"],
  "optional_skills": ["fastapi", "accounting"],
  "business_model": "services_then_product",
  "revenue_model": "consulting_ramp",
  "base_difficulty": 55,
  "capital_required_inr": 100000,
  "time_to_first_revenue_months": 3,
  "wealth_ceiling_inr_5y": 30000000
}
```

#### Skill match score

```
for each template T:
  required_match = |required_skills ∩ user_skills| / |required_skills|
  proficiency_bonus = avg(user_proficiency matched skills) / 5
  optional_match = 0.15 × |optional ∩ user| / max(|optional|, 1)

  skill_fit_T = clamp(
    0.65 × required_match × 100 +
    0.25 × proficiency_bonus × 100 +
    0.10 × optional_match × 100,
    0, 100
  )
```

Only templates with `skill_fit >= 40` become candidates.

#### Trend-adjusted opportunity score

```
opportunity_score = clamp(
  skill_fit × 0.55 +
  vertical_trend_score × 0.30 +
  market_tailwind_score × 0.15,
  0, 100
)

vertical_trend_score from market_trends.json (0–100), e.g.:
  ai: 92, healthcare: 78, stock_market_tools: 70, saas_b2b: 75
```

#### Revenue projection models

Three model families — selected per template `revenue_model`:

**A — SaaS MRR ramp** (Simulation C aligned)

```
MRR_m = min(mrr_cap, mrr_0 × (1 + g)^m)   for m >= time_to_first_revenue
mrr_0 = base_mrr × (skill_fit / 100)       // skill scales initial traction
g = monthly_growth rate (default 8–12% by vertical)
mrr_cap = template ceiling scaled by market size tier

founder_take_m = MRR_m × gross_margin × founder_share
gross_margin default 0.75 (SaaS), 0.55 (services)
```

**B — Consulting / agency** (Simulation D aligned)

```
billable_hours_m = ramp(hours_0 → hours_cap, months)
rate_inr = base_rate × (1 + skill_fit/200)
revenue_m = billable_hours_m × rate_inr × utilization
```

**C — Stock market / content hybrid**

```
subscribers_m = ramp(0 → cap, months)
arpu_inr = tier price
revenue_m = subscribers_m × arpu + advisory_retainer_optional
```

**Projection output per idea** (pessimistic / base / optimistic):

| Band | Adjustment |
|------|------------|
| Pessimistic | `g × 0.7`, `time_to_revenue + 3mo`, `churn + 20%` |
| Base | template defaults |
| Optimistic | `g × 1.2`, `mrr_cap × 1.3`, optional exit event Y5 |

```
cumulative_founder_wealth_5y = Σ founder_take_m + exit_proceeds_inr
exit_proceeds_inr (optimistic only) = min(wealth_ceiling, 3 × ARR × multiple)
```

---

### 9.5 Difficulty score and skills gap

#### Difficulty score (0–100, higher = harder)

```
difficulty = clamp(
  0.25 × base_difficulty_template +
  0.20 × capital_intensity_score +
  0.20 × regulatory_burden_score +
  0.15 × sales_complexity_score +
  0.10 × skills_gap_penalty +
  0.10 × time_to_revenue_penalty,
  0, 100
)
```

| Factor | Source |
|--------|--------|
| `capital_intensity` | `capital_required / available_runway_inr` |
| `regulatory_burden` | healthcare=80, fintech=70, generic saas=30 |
| `sales_complexity` | enterprise=75, SMB=45, PLG=35 |
| `skills_gap_penalty` | missing required skills × 15 each |
| `time_to_revenue_penalty` | `min(months/12, 1) × 40` |

#### Required skills output

```
required_skills_report = {
  "matched": [{ "skill", "user_level", "required_level" }],
  "gaps": [{ "skill", "importance", "learn_hours_est", "resources[]" }],
  "coverage_pct": matched_required / total_required × 100
}
```

`learn_hours_est` from static lookup table (solo-dev friendly).

---

### 9.6 Go-to-market roadmap

Auto-generated **4-phase roadmap** per idea (customized by vertical + skill gaps).

| Phase | Months | Objectives |
|-------|--------|--------------|
| **Validate** | 0–2 | 10 customer interviews, landing page, pricing hypothesis |
| **Build MVP** | 2–5 | Core feature set; first design partner |
| **Launch** | 5–8 | First paying customers; iterate onboarding |
| **Scale** | 8–24 | Channel expansion, hire/delegate, unit economics |

**Per-phase output:**

```json
{
  "phase": "validate",
  "months": [0, 2],
  "milestones": [
    "Complete 10 ICP interviews (healthcare clinic admins)",
    "Publish landing page with waitlist target 50"
  ],
  "kpis": { "waitlist": 50, "interviews": 10 },
  "budget_inr": 25000,
  "skills_focus": ["customer_discovery", "copywriting"]
}
```

**GTM channel selection** (rule-based):

| Condition | Primary channel |
|-----------|-----------------|
| `skill_fit.sales >= 4` | Outbound / LinkedIn |
| `vertical == saas` + PLG template | Content + SEO + free tier |
| `vertical == ai` | Demo-led + case studies |
| `vertical == stock_market` | Community + newsletter |
| `healthcare` | Compliance-first partnerships |

---

### 9.7 Wealth creation ranking

Primary rank key: **`wealth_creation_score`** (0–100).

#### Expected wealth creation (5Y)

```
W_base = cumulative_founder_wealth_5y (base revenue band)
W_opt  = cumulative_founder_wealth_5y (optimistic)

expected_wealth_inr = 0.25 × W_pessimistic + 0.55 × W_base + 0.20 × W_opt
```

#### Success probability

```
P_success = clamp(
  0.30 × (skill_fit / 100) +
  0.25 × (runway_months / 18) +
  0.20 × (1 - difficulty / 100) +
  0.15 × (opportunity_score / 100) +
  0.10 × (EF_mo / 12),
  0.08, 0.75
)
```

Cap 75% — startups remain uncertain.

#### Wealth creation score

```
risk_adjusted_wealth = expected_wealth_inr × P_success

wealth_creation_score = clamp(
  normalize_log(risk_adjusted_wealth, ₹5L, ₹2Cr) × 100,
  0, 100
)

normalize_log(w, lo, hi) = (log(w) - log(lo)) / (log(hi) - log(lo))
```

#### Secondary sort keys

1. `wealth_creation_score` DESC  
2. `difficulty` ASC (tie-break: easier first)  
3. `time_to_first_revenue_months` ASC  

#### Hard filters (exclude idea)

| Rule | Reason |
|------|--------|
| `runway_months < capital_required_months` | Cannot fund |
| `skill_fit < 40` | Poor fit |
| `EF_mo < 6` AND `capital_required > 200000` | Safety gate |
| User `risk_tolerance < 30` AND `difficulty > 70` | Mismatch |

---

### 9.8 Output schema and API

#### `StartupOpportunityResult`

```json
{
  "computed_at": "2026-06-10T15:00:00Z",
  "profile_summary": {
    "top_skills": ["python", "react", "fintech"],
    "runway_months": 14,
    "verticals_scanned": ["ai", "healthcare", "stock_market", "saas"]
  },
  "ideas": [
    {
      "rank": 1,
      "id": "ai_smb_automation_agency",
      "title": "AI workflow automation for Indian SMBs",
      "vertical": "ai",
      "wealth_creation_score": 81,
      "expected_wealth_inr_5y": 18500000,
      "p_success_pct": 42,
      "opportunity_score": 78,
      "skill_fit": 85,
      "difficulty": 52,
      "capital_required_inr": 100000,
      "time_to_first_revenue_months": 3,
      "revenue_projection": {
        "pessimistic": { "m12_mrr": 80000, "m36_mrr": 320000, "cumulative_5y": 4200000 },
        "base": { "m12_mrr": 150000, "m36_mrr": 650000, "cumulative_5y": 12400000 },
        "optimistic": { "m12_mrr": 280000, "m36_mrr": 1200000, "cumulative_5y": 28000000, "exit_inr": 8000000 }
      },
      "required_skills": {
        "coverage_pct": 83,
        "matched": ["python", "sales"],
        "gaps": [{ "skill": "accounting_domain", "learn_hours_est": 40 }]
      },
      "gtm_roadmap": {
        "phases": []
      },
      "linked_simulation": "D",
      "one_liner": "Productized AI audits for CA firms → recurring automation retainers."
    }
  ],
  "disclaimer": "Illustrative scenarios only; not business or investment advice."
}
```

#### API endpoints

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /startup/opportunities` | `{ skill_profile, wealth_context, risk_tolerance?, top_n? }` | `StartupOpportunityResult` |
| `POST /startup/opportunities/idea` | `{ idea_id, skill_profile }` | Single idea deep dive |
| `POST /analyze-startup-ai` | `{ opportunity_result, question? }` | LLM narrative (optional) |

**Unified North Star pipeline** (extends §8.6):

```
POST /compute-north-star
  1. wealth_engine.compute
  2. wealth_simulation_engine.run_all
  3. startup_opportunity_engine.run        ← new
  4. recommendation_engine.recommend       ← uses ranked ideas
  5. north_star_engine.assemble_payload
```

#### UI — Startup Ideas panel (North Star §2)

| Element | Source |
|---------|--------|
| Ranked idea cards | `ideas[0..4]` |
| Wealth score badge | `wealth_creation_score` |
| Revenue chart | `revenue_projection.base` MRR curve |
| Difficulty meter | `difficulty` |
| Skills gap chips | `required_skills.gaps` |
| GTM timeline | `gtm_roadmap.phases` |
| “Simulate this idea” CTA | Pushes params into Simulation C/D |

#### v1 storage

| Key | Content |
|-----|---------|
| `north-star-startup-opportunities-v1` | Last `StartupOpportunityResult` |
| `north-star-skill-profile-v1` | User skills form |

#### Event integration

| Event | Action |
|-------|--------|
| `startup.opportunities.generated` | Update Recommendation + UI |
| `startup.idea.selected` | Re-run Simulation C/D with idea params |
| `wealth.input.manual_updated` (skills) | Debounce → regenerate opportunities |

---

## 10. Personal Wealth Knowledge Graph

The **Personal Wealth Knowledge Graph (PWKG)** is the unified semantic layer connecting user identity, capabilities, cashflows, holdings, obligations, and goals. Engines (§6–§9) read and write graph nodes; **reasoning queries** traverse edges to explain *why* an action accelerates a goal.

Example query:

> *"What action today increases probability of reaching ₹10Cr fastest?"*

**Design goals:** Solo-developer friendly, $0 infra in v1, property-graph model in SQLite, upgrade path to Neo4j/Postgres without schema rewrite.

### 10.1 Role in the stack

```
Dashboards + forms + imports
         │
         ▼
┌────────────────────────────────────────┐
│     Personal Wealth Knowledge Graph     │
│  Nodes: User, Skills, Projects, …       │
│  Edges: ENABLES, FUNDS, TARGETS, …      │
└───────────────┬────────────────────────┘
                │
    ┌───────────┼───────────┬───────────────┐
    ▼           ▼           ▼               ▼
Wealth      Simulation  Recommendation   Reasoning
Engine      Engine      Engine           Query Service
    │           │           │               │
    └───────────┴───────────┴───────────────┘
                        │
                        ▼
              North Star UI + AI Ask
```

| Role | PWKG responsibility |
|------|---------------------|
| **Canonical model** | Single source of entity identity across engines |
| **Provenance** | Which dashboard last updated each node |
| **Reasoning** | Explain paths User → … → Goal (₹10Cr) |
| **Gap detection** | Missing skills, thin EF, blocking liabilities |

Engines remain authoritative for **numeric scores**; the graph is authoritative for **relationships and explainability**.

---

### 10.2 Graph schema

Property graph: **nodes** (entities) + **directed edges** (relationships) + **properties** on both.

#### 10.2.1 Node types (9 entities)

| Type | ID prefix | Key properties | Source |
|------|-----------|----------------|--------|
| **User** | `user:` | `display_name`, `risk_tolerance`, `horizon_profile` | Auth / profile |
| **Skill** | `skill:` | `name`, `proficiency_1_5`, `years`, `category` | North Star career form |
| **Project** | `project:` | `title`, `status`, `started_at`, `expected_income_inr` | Manual / startup ideas |
| **IncomeStream** | `income:` | `stream_type` (salary, side, business), `amount_monthly_inr`, `growth_pct` | Account Analyzer, form |
| **Investment** | `invest:` | `asset_class`, `value_inr`, `expected_return_pct`, `symbol?` | CAS, MF, Stock |
| **Business** | `business:` | `name`, `stage`, `mrr_inr`, `idea_id?` | Startup Engine §9 |
| **Asset** | `asset:` | `asset_type` (EF, FD, property, crypto), `value_inr`, `liquidity` | Wealth Engine §6 |
| **Liability** | `liab:` | `liab_type` (loan, CC), `balance_inr`, `rate_pct`, `emi_inr` | Manual (v2) |
| **Goal** | `goal:` | `target_inr`, `target_date?`, `milestone_label` (1Cr/5Cr/10Cr) | North Star header |

#### 10.2.2 Computed node types (engine outputs, optional in graph)

| Type | Purpose |
|------|---------|
| **Action** | Recommendation Engine output (`switch_job`, `save_more`, …) |
| **Scenario** | Simulation A–F snapshot |
| **StartupIdea** | Startup Opportunity Engine ranked idea |

These are **reified** as nodes so reasoning queries can link `Action → ACCELERATES → Goal`.

#### 10.2.3 Edge types

| Edge | From → To | Meaning | Weight semantics |
|------|-----------|---------|------------------|
| `HAS_SKILL` | User → Skill | User possesses skill | `proficiency_1_5` |
| `OWNS` | User → Asset, Investment, Business, Liability | Ownership | `ownership_pct` default 100 |
| `WORKS_ON` | User → Project | Active effort | `hours_per_week` |
| `ENABLES` | Skill → Project, Skill → Business, Skill → StartupIdea | Capability unlock | `match_score` |
| `GENERATES` | Project, Business → IncomeStream | Revenue source | `contribution_pct` |
| `FUNDS` | IncomeStream → Investment, Asset | Savings deployment | `flow_inr_monthly` |
| `TARGETS` | User, Project, Business → Goal | Intent | `priority` |
| `ACCELERATES` | Action, Scenario, StartupIdea → Goal | Modeled NW uplift | `delta_nw_inr`, `p_success` |
| `REQUIRES` | Goal, Business, Project → Skill | Dependency gap | `required_level` |
| `BLOCKS` | Liability → Goal | Drag on progress | `emi_inr`, `rate_pct` |
| `COMPOUNDS` | Investment → Goal | Passive growth path | `expected_return_pct` |
| `HELD_IN` | Investment → Asset | Custody (demat, MF folio) | — |
| `DERIVED_FROM` | Any → Source dashboard | Provenance | `source`, `imported_at` |

#### 10.2.4 Entity-relationship diagram

```
                         ┌─────────┐
                         │  User   │
                         └────┬────┘
           HAS_SKILL          │ OWNS
              ┌───────────────┼───────────────┬──────────────┐
              ▼               ▼               ▼              ▼
         ┌────────┐    ┌────────────┐  ┌────────────┐  ┌──────────┐
         │ Skill  │    │ Investment │  │  Business  │  │ Liability│
         └───┬────┘    └─────┬──────┘  └─────┬──────┘  └────┬─────┘
             │ ENABLES       │ COMPOUNDS     │ GENERATES    │ BLOCKS
             ▼               │               ▼              │
         ┌────────┐          │         ┌────────────┐       │
         │ Project│          │         │IncomeStream│       │
         └───┬────┘          │         └─────┬──────┘       │
             │ GENERATES     │               │ FUNDS        │
             └───────────────┼───────────────┘              │
                             ▼                              │
                        ┌─────────┐                         │
                        │  Goal   │◄──── ACCELERATES ─── Action / Scenario
                        │ (10Cr)  │
                        └─────────┘
```

#### 10.2.5 SQLite storage (v1 — same file as §6.2 or dedicated `knowledge_graph.db`)

**`kg_nodes`**

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `skill:python`, `goal:10cr` |
| user_id | TEXT | |
| node_type | TEXT | enum |
| label | TEXT | display |
| properties_json | TEXT | all typed fields |
| source | TEXT | `manual`, `cas_import`, `engine` |
| updated_at | TEXT | ISO8601 |

**`kg_edges`**

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT | |
| src_id | TEXT FK → kg_nodes | |
| dst_id | TEXT FK → kg_nodes | |
| edge_type | TEXT | |
| weight | REAL | optional |
| properties_json | TEXT | `delta_nw_inr`, `p_success`, etc. |
| valid_from | TEXT | |
| valid_to | TEXT | null = active |

Indexes: `(user_id, node_type)`, `(src_id, edge_type)`, `(dst_id, edge_type)`.

**v1 sessionStorage mirror:** `north-star-knowledge-graph-v1` — full graph JSON for stateless API requests.

#### 10.2.6 Postgres / Neo4j upgrade (Phase 4)

| v1 SQLite | Upgrade |
|-----------|---------|
| `kg_nodes` | `kg_nodes` table or Neo4j `:Node` labels |
| `kg_edges` | `kg_edges` or Neo4j `:REL` types |
| SQL traversals | Cypher / recursive CTE |

Node `id` and `edge_type` strings are storage-agnostic.

---

### 10.3 Architecture

#### Component layout

```
server/services/knowledge_graph/
  __init__.py
  models.py                 # Node, Edge, GraphSnapshot
  store/
    sqlite_store.py         # CRUD nodes/edges
    memory_store.py         # dev / unit tests
  builder/
    graph_builder.py        # merge engine outputs into graph
    adapters/
      wealth_adapter.py     # §6 → Assets, Investments, Income
      simulation_adapter.py # §7 → Scenario nodes, ACCELERATES edges
      recommendation_adapter.py  # §8 → Action nodes
      startup_adapter.py    # §9 → Business, StartupIdea
      dashboard_adapters.py # CAS, MF, Stock, Account
  query/
    reasoning_engine.py     # template queries + traversal
    path_finder.py          # shortest/max-weight paths to Goal
    gap_analyzer.py           # missing REQUIRES edges
  sync.py                   # event-driven upsert
  api.py                    # FastAPI handlers
```

#### GraphBuilder pipeline

```
onEvent(wealth.metrics.computed | recommendations.computed | …):
  1. Load existing GraphSnapshot for user
  2. Run adapters → List[Node], List[Edge] deltas
  3. Upsert nodes (merge properties by id)
  4. Upsert edges (replace ACCELERATES for same Action→Goal)
  5. Prune stale DERIVED_FROM older than retention
  6. Emit knowledge_graph.updated
```

#### Read pattern for engines

Engines **may** read graph for context but **write back** via adapters after compute — avoids circular dependency.

---

### 10.4 Ingestion and sync

#### Source → entity mapping

| Source | Nodes created/updated | Edges |
|--------|----------------------|-------|
| Wealth Engine §6 | Asset, Investment, IncomeStream, Goal | User OWNS, Income FUNDS Investment, Investment COMPOUNDS Goal |
| North Star form | Skill, Goal, User props | HAS_SKILL, TARGETS |
| CAS / MF / Stock import | Investment | DERIVED_FROM, OWNS |
| Account Analyzer | IncomeStream (expense infer), IncomeStream | GENERATES (negative flow as property) |
| Simulation §7 | Scenario | Scenario ACCELERATES Goal (weight = ΔNW, p_success) |
| Recommendation §8 | Action | Action ACCELERATES Goal |
| Startup §9 | StartupIdea, Business | ENABLES, User WORKS_ON Project |

#### Event-driven sync (extends §6.5)

| Event | Graph mutation |
|-------|----------------|
| `wealth.metrics.computed` | Upsert Assets, Investments, Goals; refresh COMPOUNDS weights |
| `wealth.recommendations.computed` | Replace Action nodes + ACCELERATES edges |
| `wealth.simulation.completed` | Upsert Scenario nodes |
| `startup.opportunities.generated` | Upsert StartupIdea + ENABLES from Skills |
| `wealth.import.cas_completed` | Bulk Investment nodes |
| `knowledge_graph.updated` | Invalidate reasoning query cache |

#### Identity rules

```
Investment node id = invest:{asset_class}:{source}:{symbol_or_folio}
Goal node id = goal:{milestone_inr}   // goal:100000000 for ₹10Cr
Skill node id = skill:{normalized_name}
Action node id = action:{action_id}:{computed_at_date}
```

Prevents duplicate nodes on re-import.

---

### 10.5 Reasoning queries

#### Query interface

```python
class ReasoningEngine:
    def query(
        self,
        user_id: str,
        template: str,
        params: dict,
    ) -> ReasoningResult: ...
```

Templates (extensible):

| Template ID | Natural language |
|-------------|----------------|
| `fastest_to_goal` | What action today increases P(reaching {goal}) fastest? |
| `skill_gaps_for_goal` | What skills am I missing for {goal}? |
| `blockers` | What liabilities or gaps block {goal}? |
| `path_explain` | Why does {action} accelerate {goal}? |

#### `fastest_to_goal` — algorithm

**Question:** *"What action today increases probability of reaching ₹10Cr fastest?"*

```
1. Resolve Goal node G where target_inr = 1_000_000_000 (or params.goal_id)

2. Collect candidate Action nodes:
   - From graph: all Action with edge ACCELERATES → G
   - If stale: invoke RecommendationEngine.recommend() → materialize Actions

3. For each action A:
   score(A, G) =
     0.45 × normalize(delta_nw_60m on ACCELERATES edge) +
     0.35 × p_success on edge +
     0.20 × feasibility(A)   // from RecommendationEngine

4. Rank actions by score(A, G) descending

5. Build explanation path for top action A*:
   traverse backwards from G:
     G ← ACCELERATES ← A*
     G ← COMPOUNDS ← {Investments with highest weight}
     A* ← enabled_by ← {Skills via ENABLES on linked Scenario/StartupIdea}
     G ← BLOCKS ← {Liabilities}  // negative evidence

6. Return ReasoningResult:
   - top_action, rank_list, paths[], gaps[], confidence
```

#### Path scoring on graph

```
path_weight(path) = Π edge.weight × edge.p_success   // for ACCELERATES
                  + Σ COMPOUNDS.expected_return_pct    // passive leg
                  - Σ BLOCKS.emi_inr × months_to_goal  // liability drag
```

#### Example response

```json
{
  "query": "fastest_to_goal",
  "goal": { "id": "goal:100000000", "label": "₹10Cr", "current_progress_pct": 42 },
  "answer": {
    "top_action": {
      "id": "action:switch_job:2026-06-10",
      "label": "Switch job",
      "score": 0.78,
      "p_reach_goal_5y": 0.34,
      "months_to_goal_delta": -18
    },
    "ranked_actions": [],
    "reasoning_paths": [
      {
        "summary": "Switch job increases 5Y NW by ₹98L vs baseline; linked Scenario B.",
        "nodes": ["user:1", "action:switch_job:…", "goal:100000000"],
        "edges": ["ACCELERATES", "TARGETS"],
        "evidence": {
          "salary_vs_market_pct": 0.82,
          "simulation_B_p_success_60m": 0.72
        }
      }
    ],
    "gaps": [
      { "type": "skill", "skill": "negotiation", "impact": "medium" }
    ],
    "blockers": [
      { "type": "liability", "label": "Personal loan", "emi_inr": 18000 }
    ]
  },
  "disclaimer": "Graph reasoning uses engine projections; not advice."
}
```

#### AI Ask integration

`POST /ask-north-star-ai` and `POST /knowledge-graph/ask` receive `reasoning_paths` in context. LLM explains paths — **must not invent nodes or edges**.

#### Deterministic vs LLM

| Step | Owner |
|------|-------|
| Graph traversal, ranking | `ReasoningEngine` (deterministic) |
| Natural language summary | Optional LLM over `ReasoningResult` |

---

### 10.6 API and storage

#### Endpoints

| Endpoint | Method | Role |
|----------|--------|------|
| `GET /knowledge-graph/snapshot` | GET | Full graph for user (UI viz) |
| `POST /knowledge-graph/sync` | POST | Force rebuild from latest engine outputs |
| `POST /knowledge-graph/query` | POST | `{ template, params }` → `ReasoningResult` |
| `POST /knowledge-graph/ask` | POST | NL question → map to template → answer |

**Example query request**

```json
{
  "template": "fastest_to_goal",
  "params": { "goal_target_inr": 100000000, "horizon_months": 60 }
}
```

#### Unified North Star pipeline (final)

```
POST /compute-north-star
  1. wealth_engine.compute
  2. wealth_simulation_engine.run_all
  3. startup_opportunity_engine.run
  4. recommendation_engine.recommend
  5. knowledge_graph.sync(all_outputs)     ← materialize graph
  6. reasoning_engine.query(fastest_to_goal)  ← optional precompute
  7. north_star_engine.assemble_payload
```

#### Client visualization (v2)

- Force-directed subgraph: User → Goal with highlighted top path
- Node colors by type; edge thickness = weight
- v1: JSON tree in Ask tab / debug panel

#### Caching

| Cache key | TTL |
|-----------|-----|
| `kg:reasoning:{user}:{template}:{goal}` | 15 min or until `knowledge_graph.updated` |
| Graph snapshot | Invalidated on any sync event |

#### Solo-dev ops

- Single SQLite file `server/data/knowledge_graph.db` (gitignored)
- No graph DB server until >500 active users
- Export `GET /knowledge-graph/snapshot` as JSON backup

---

## Summary

North Star Mode is a new sidebar dashboard that fits the existing Personal Wealth Analyzer architecture:

- **Client**: `north-star.tsx` with Manual / AI / Ask tabs and `sessionStorage` snapshots
- **Wealth Engine** (§6): deterministic core — NW, FI score, velocity, time-to-₹1Cr/₹5Cr/₹10Cr
- **Wealth Simulation Engine** (§7): scenarios A–F — NW growth, cash flow, risk, P(success) at 1/3/5/10 years
- **Startup Opportunity Engine** (§9): skill-matched ideas across AI, healthcare, markets, SaaS; revenue projections + GTM; ranked by wealth creation
- **Recommendation Engine** (§8): ranks 7 actions (Invest, Save, Startup, Upskill, Switch job, Diversify, Concentrate) for 1/3/5Y NW growth
- **Personal Wealth Knowledge Graph** (§10): entities, relationships, reasoning queries (e.g. fastest path to ₹10Cr)
- **NorthStarEngine**: orchestrates unified payload; syncs graph; serves reasoning results
- **AINorthStarAnalyzer**: narrative layer; never owns the math
- **Integration**: read-only adapters from Wealth Distribution, Account Analyzer, MF, Stock, and CAS
- **Persistence path**: sessionStorage (v1) → PostgreSQL schema in §6.2 + `simulation_runs` (Phase 3)
- **Reactivity**: event-driven recompute pipeline in §6.5

The product differentiator is the **Recommendation Board** (§2.5) fed by the **Recommendation Engine** (§8) and **Wealth Simulation Engine** (§7) — ranked actions with expected NW impact at 1/3/5 years, not a single generic projection.

### Related modules

| Module | Doc | Integration |
|--------|-----|-------------|
| Investment Copilot | [`investment_copilot.md`](investment_copilot.md) | Stock Analyzer signals feed Scenario E risk overlay; equity allocation context for Wealth Engine |
| Market data ingestion | [`market_data_ingestion.md`](market_data_ingestion.md) | Price marks for Wealth Engine; volatility for Simulation E/F; Copilot data store; macro trends for §9 |
