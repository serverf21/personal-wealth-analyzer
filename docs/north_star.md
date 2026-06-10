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

**Default path templates the engine considers:**

1. **Pure accumulation** — savings + modest market returns
2. **Income growth** — career CAGR as primary driver
3. **Allocation shift** — higher equity/debt mix for faster compounding
4. **Hybrid accelerator** — raise + savings + rebalancing combined
5. **Opportunistic** — startup/side income (clearly labeled speculative)

Ranking philosophy: **fastest *realistic*** — speculative paths rank lower unless user explicitly opts in.

---

### Section 4 — Milestone Timeline

- Horizontal timeline: today → ₹1Cr → ₹5Cr → ₹10Cr
- Stacked scenarios (base vs accelerated)
- Inflection points: when savings surpass investment returns; when compounding dominates

---

### Section 5 — Lever Board (actionable levers)

| Lever | Current | Target for fastest path | Impact (months) |
|-------|---------|-------------------------|-----------------|
| Savings rate | 32% | 42% | −6 mo |
| Annual income | ₹24L | ₹28L | −4 mo |
| Equity allocation | 45% | 55% | −3 mo (higher risk) |

Sorted by **impact per unit effort** (configurable weights).

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
| **Domain engine** | Milestone math, path ranking, sensitivity (no LLM) | `server/services/north_star_engine.py` |
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
                              NorthStarEngine
                                 ├── Monthly simulator
                                 ├── Path generator + ranker
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
| Monte Carlo | Replace fixed CAGR with distribution; probability of hitting milestone by date |
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

## Summary

North Star Mode is a new sidebar dashboard that fits the existing Personal Wealth Analyzer architecture:

- **Client**: `north-star.tsx` with Manual / AI / Ask tabs and `sessionStorage` snapshots
- **Server**: `NorthStarEngine` (deterministic) + `AINorthStarAnalyzer` (narrative)
- **Integration**: Read-only adapters from Wealth Distribution, Account Analyzer, MF, Stock, and CAS

The product differentiator is the **Path Ranker** — continuously answering the strategic question with ranked, realistic routes rather than a single generic projection.
