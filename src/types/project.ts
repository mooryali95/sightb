export interface Company {
  id: string;
  name: string;
  description?: string;
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
  portfolioId: string;
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
  month?: number; // 1-based month index
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

export interface ProjectSummary {
  totalBudget: number;
  totalPlanned: number;
  totalActual: number;
  totalRevenue: number;
  netProfit: number;
  profitMargin: number;
  remaining: number;
}
