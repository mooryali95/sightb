export type CompanyStatus = 'active' | 'archived';

export interface Company {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  status: CompanyStatus;
  createdAt: string;
}

export interface Portfolio {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export type ProjectStatus = 'planning' | 'pending_approval' | 'approved' | 'active' | 'on-hold' | 'completed' | 'archived' | 'cancelled';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'تخطيط',
  pending_approval: 'قيد التعميد',
  approved: 'تم التعميد',
  active: 'تشغيل',
  'on-hold': 'معلق',
  completed: 'مكتمل',
  archived: 'مؤرشف',
  cancelled: 'ملغي',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  active: 'bg-primary/10 text-primary',
  'on-hold': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  archived: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

export interface Project {
  id: string;
  portfolioId?: string;
  companyId: string;
  name: string;
  description?: string;
  contractValue: number;
  currency: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  resourceCount: number;
  status: ProjectStatus;
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

export interface Resource {
  id: string;
  projectId: string;
  name: string;
  role?: string;
  monthlyCost: number;
  createdAt: string;
}

export interface Custody {
  id: string;
  projectId?: string;
  companyId?: string;
  resourceName: string;
  amount: number;
  spent: number; // calculated client-side
  remaining: number; // calculated client-side
  notes?: string;
  createdAt: string;
}

export interface BudgetItem {
  id: string;
  projectId: string;
  category: ExpenseCategory;
  description: string;
  plannedAmount: number;
  month?: number;
  resourceId?: string;
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
  resourceId?: string;
  custodyId?: string;
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
