export interface Company {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  createdAt: string;
}

export interface Portfolio {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  portfolioId?: string; // optional - can be directly under company
  companyId: string;
  name: string;
  description?: string;
  contractValue: number;
  currency: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  resourceCount: number;
  status: 'active' | 'completed' | 'on-hold' | 'cancelled';
  clientLogo?: string;
  createdAt: string;
}

export type ExpenseCategory =
  | 'salary'
  | 'travel'
  | 'hotel'
  | 'food'
  | 'printing'
  | 'photography'
  | 'import'
  | 'training'
  | 'consulting'
  | 'media'
  | 'hospitality'
  | 'equipment'
  | 'software'
  | 'contingency'
  | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salary: 'رواتب موظفين',
  travel: 'سفر وتنقل',
  hotel: 'إقامة وفنادق',
  food: 'مطاعم وضيافة',
  printing: 'طباعة ونسخ',
  photography: 'تصوير',
  import: 'استيراد',
  training: 'تدريب وقاعات',
  consulting: 'استشارات',
  media: 'تغطية إعلامية',
  hospitality: 'ضيافة',
  equipment: 'معدات وأجهزة',
  software: 'برمجيات',
  contingency: 'احتياطي وطوارئ',
  other: 'أخرى',
};

export interface BudgetItem {
  id: string;
  projectId: string;
  category: ExpenseCategory;
  description: string;
  plannedAmount: number;
  month?: number;
}

export interface Expense {
  id: string;
  projectId: string;
  budgetItemId?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  month: number;
  responsible?: string;
  notes?: string;
}

export interface Revenue {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  date: string;
  month: number;
}

export interface CostBaseline {
  id: string;
  projectId: string;
  name: string;
  version: number;
  isActive: boolean;
  totalPlanned: number;
  createdAt: string;
  items: BaselineItem[];
}

export interface BaselineItem {
  id: string;
  baselineId: string;
  category: ExpenseCategory;
  description: string;
  plannedAmount: number;
  month?: number;
}

export interface ProjectSummary {
  totalBudget: number;
  totalPlanned: number;
  totalActual: number;
  totalRevenue: number;
  netProfit: number;
  profitMargin: number;
  remaining: number;
}

export interface EVMMetrics {
  pv: number; // Planned Value (cumulative baseline planned up to current month)
  ev: number; // Earned Value (% complete × BAC)
  ac: number; // Actual Cost
  bac: number; // Budget at Completion (total baseline)
  cv: number; // Cost Variance (EV - AC)
  sv: number; // Schedule Variance (EV - PV)
  cpi: number; // Cost Performance Index (EV / AC)
  spi: number; // Schedule Performance Index (EV / PV)
  eac: number; // Estimate at Completion (BAC / CPI)
  etc: number; // Estimate to Complete (EAC - AC)
  vac: number; // Variance at Completion (BAC - EAC)
}
