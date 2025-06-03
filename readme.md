# Personal Wealth Analyzer

An AI-powered personal finance platform that analyzes your spending patterns, optimizes investment portfolios, and provides intelligent recommendations to maximize your wealth growth.

## To host the server -

- python3 -m venv venv
- source venv/bin/activate
- uvicorn main:app --reload --host 0.0.0.0 --port 8000

## To host the client -

npm run start

# Features to be integrated

## Core Financial Management Components:

1. Account Statement Analyzer (By taking PDF statement as input and making charts, using AI to analyze the necessary purchases and cuts required)
2. Investments Analyzer - Analyzes the net worth distribution among asset classes like equities (stocks and MFs), gold, real estate, FDs.
3. Budget Planner & Tracker - Beyond analyzing past spending, provide tools to set monthly budgets by category, track progress in real-time, and send alerts when approaching limits. Include features for irregular expenses like insurance premiums or annual subscriptions.
4. Cash Flow Forecasting - Project future cash flows based on historical patterns, upcoming known expenses, and income changes. This helps users understand their financial runway and plan major purchases.
5. Debt Management Dashboard - Track all debts (credit cards, loans, mortgages), calculate payoff timelines, compare debt consolidation strategies, and optimize payment schedules using debt avalanche or snowball methods.
6. Goal-Based Financial Planning - Allow users to set specific financial goals (emergency fund, home down payment, retirement) with target amounts and timelines. Show progress tracking and required monthly savings to meet goals.
7. Tax Optimization Center - Analyze tax-saving opportunities, track tax-deductible expenses, suggest optimal investment timing for tax efficiency, and estimate annual tax liability.

## Advanced Analysis Features:

8. Risk Assessment Tool - Evaluate overall portfolio risk tolerance, concentration risk across investments, and suggest rebalancing strategies.
9. Performance Analytics - Track investment returns, benchmark against market indices, calculate risk-adjusted returns, and identify best/worst performing assets.
10. Expense Categorization & Trends - Use AI to automatically categorize expenses, identify spending patterns, seasonal variations, and highlight unusual transactions.
11. Net Worth Tracker - Comprehensive view of assets minus liabilities over time, with ability to manually add assets like jewelry, collectibles, or business equity.
12. Insurance Coverage Analyzer - Assess adequacy of life, health, property insurance coverage based on current net worth and dependents.
13. Retirement Planning Calculator - Project retirement corpus needs, analyze current savings rate adequacy, and suggest course corrections.

## Additional Utility Components:

14. Bill Management - Track recurring bills, predict monthly expenses, and identify subscription services that might be cancelled.
15. Credit Score Monitoring - If possible to integrate, track credit score changes and factors affecting it.
16. Financial News & Alerts - Personalized financial news based on user's investment portfolio and spending categories.
17. Document Storage - Secure storage for financial documents, tax returns, insurance policies, and investment certificates.
18. Multi-Currency Support - For users with international investments or expenses.
    The key is to make these components work together seamlessly. For example, the budget tracker should inform the goal planner, which should connect to the investment analyzer for optimal asset allocation recommendations. Consider implementing a dashboard that provides a unified view with the most critical metrics and alerts from all components.
