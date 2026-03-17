export interface MenuItem {
    id: string;
    title: string;
    icon: string;
  }

export const menuItems: MenuItem[] = [
    { id: 'account-analyzer', title: 'Account Statement Analyzer', icon: '📊' },
    { id: 'investment-analyzer', title: 'MF Analyzer', icon: '💹' },
    { id: 'budget-tracker', title: 'Budget Tracker', icon: '💰' },
    { id: 'goal-planner', title: 'Goal Planner', icon: '🎯' },
    { id: 'debt-manager', title: 'Debt Manager', icon: '💳' },
    { id: 'stock-ticker', title: 'Stock Ticker', icon: '📈' },
    { id: 'cash-flow', title: 'Cash Flow', icon: '💸' },
    { id: 'tax-optimizer', title: 'Tax Optimizer', icon: '📋' },
  ];