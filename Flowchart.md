# Dashboard flowcharts

High-level user and data flows for **Personal Wealth Analyzer** dashboards. Diagrams use [Mermaid](https://mermaid.js.org/) (render in GitHub, VS Code with a Mermaid extension, or export to SVG/PNG).

---

## Account Statement Analyzer

```mermaid
flowchart TD
  A[User opens dashboard] --> B[Upload bank PDF]
  B --> C[POST /upload-pdf]
  C --> D[Extract tables with pdfplumber]
  D --> E[Store JSON in session]
  E --> F{Choose tab}
  F -->|Tabulated| G[GenericTable view]
  F -->|Charts| H[SpendingCharts from tables]
  F -->|AI Insights| I[POST /analyze-ai-transactions]
  I --> J[AITransactionAnalyzer + OpenAI]
  J --> K[Spending recommendations]
```

---

## MF Analyzer

```mermaid
flowchart TD
  A[User opens MF Analyzer] --> B[Upload holdings .xlsx]
  B --> C[POST /upload-mf-holdings-excel]
  C --> D[Parse Holdings sheet: profile, summary, rows]
  D --> E[Compute allocations & concentration]
  E --> F[Persist snapshot in session]
  F --> G{Tab}
  G -->|Manual| H[Pie/bar charts + KPI cards]
  G -->|AI| I[POST /analyze-mf-ai]
  I --> J[AIMFAnalyzer structured report]
  G -->|AI Ask| K[POST /ask-mf-ai chat]
```

---

## Stock Market Analysis

```mermaid
flowchart TD
  A[User opens Stock Analysis] --> B[Upload equity .xlsx]
  B --> C[POST /upload-stock-holdings-excel]
  C --> D[Parse symbols, qty, values]
  D --> E[Show parsed totals immediately]
  E --> F[POST /enrich-stock-portfolio]
  F --> G[Parallel Yahoo Finance per symbol]
  G --> H[Merge enrichment + manual hints]
  H --> I{Tab}
  I -->|Manual| J[Charts, alerts, holdings table]
  I -->|AI| K[POST /analyze-stock-ai]
  K --> L[AIMStockAnalyzer]
  I -->|Ask| M[POST /ask-stock-ai]
```

---

## Wealth Distribution

```mermaid
flowchart TD
  A[User opens Wealth Distribution] --> B[Enter net worth, optional income, upcoming expenses + horizon, notes]
  B --> C[Compute ideal ₹ split from NW × reference % bands]
  C --> D[Session save + manual alerts vs short-term / emergency]
  D --> E{Tab}
  E -->|Manual analysis| F[Table + bar chart of midpoint %]
  E -->|AI insights| G[POST /analyze-wealth-distribution-ai]
  G --> H[Funding upcoming spends + boost bucket + segment notes]
  E -->|Ask| I[POST /ask-wealth-distribution-ai]
```

---

## Budget Tracker (placeholder)

```mermaid
flowchart LR
  A[Sidebar: Budget Tracker] --> B[Coming soon screen]
```

---

## Goal Planner (placeholder)

```mermaid
flowchart LR
  A[Sidebar: Goal Planner] --> B[Coming soon screen]
```

---

## Debt Manager (placeholder)

```mermaid
flowchart LR
  A[Sidebar: Debt Manager] --> B[Coming soon screen]
```

---

## Cash Flow (placeholder)

```mermaid
flowchart LR
  A[Sidebar: Cash Flow] --> B[Coming soon screen]
```

---

## Tax Optimizer (placeholder)

```mermaid
flowchart LR
  A[Sidebar: Tax Optimizer] --> B[Coming soon screen]
```

---

## Shared client stack

```mermaid
flowchart LR
  subgraph Client
    RN[React Native / Expo Web]
    API[API_BASE → FastAPI]
  end
  subgraph Server
    F[FastAPI]
    OAI[OpenAI when API key set]
  end
  RN --> API --> F
  F --> OAI
```
