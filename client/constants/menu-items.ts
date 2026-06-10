export interface MenuItem {
    id: string;
    title: string;
    icon: string;
  }

export const menuItems: MenuItem[] = [
    { id: 'account-analyzer', title: 'Account Statement Analyzer', icon: '📊' },
    { id: 'investment-analyzer', title: 'MF Analyzer', icon: '💹' },
    { id: 'stock-market-analysis', title: 'Stock Market Analysis', icon: '📈' },
    { id: 'cas-import', title: 'CAS / Demat import', icon: '📑' },
    { id: 'wealth-distribution', title: 'Wealth Distribution', icon: '⚖️' },
    { id: 'cash-flow', title: 'Cash Flow', icon: '💸' },
    { id: 'tax-optimizer', title: 'Tax Optimizer', icon: '📋' },
  ];