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

export type ContractType = 'lump_sum' | 'cost_plus' | 'time_material' | 'unit_price';

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  lump_sum: 'مبلغ مقطوع',
  cost_plus: 'تكلفة + هامش',
  time_material: 'حسب الوقت والمواد',
  unit_price: 'حسب الوحدات',
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
  percentComplete: number;
  contractType: ContractType;
  retentionPercent: number;
  managementReserve: number;
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

export type CostType = 'fixed' | 'recurring' | 'one_time';
export type CostClass = 'direct' | 'indirect';

export const COST_TYPE_LABELS: Record<CostType, string> = {
  fixed: 'مبلغ ثابت',
  recurring: 'متكرر شهرياً',
  one_time: 'مرة واحدة',
};

export const COST_CLASS_LABELS: Record<CostClass, string> = {
  direct: 'مباشر',
  indirect: 'غير مباشر',
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
  spent: number;
  remaining: number;
  notes?: string;
  createdAt: string;
}

export interface BudgetItem {
  id: string;
  projectId: string;
  category: ExpenseCategory;
  description: string;
  plannedAmount: number;
  month?: number; // legacy — kept for compatibility
  startMonth?: number;
  endMonth?: number;
  costType: CostType;
  costClass: CostClass;
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

export type RevenueType = 'advance' | 'milestone' | 'final' | 'retention' | 'variation' | 'deduction';
export type RevenueStatus = 'planned' | 'invoiced' | 'collected';

export const REVENUE_TYPE_LABELS: Record<RevenueType, string> = {
  advance: 'دفعة مقدمة',
  milestone: 'دفعة مرحلية',
  final: 'دفعة ختامية',
  retention: 'إفراج محتجزات',
  variation: 'أعمال إضافية',
  deduction: 'خصم',
};

export const REVENUE_STATUS_LABELS: Record<RevenueStatus, string> = {
  planned: 'مخطط',
  invoiced: 'مُفوتر',
  collected: 'محصّل',
};

export const REVENUE_STATUS_COLORS: Record<RevenueStatus, string> = {
  planned: 'bg-muted text-muted-foreground',
  invoiced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  collected: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export interface Revenue {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  date: string;
  month: number;
  revenueType: RevenueType;
  status: RevenueStatus;
  invoiceNumber?: string;
  invoiceDate?: string;
  collectionDate?: string;
}

export type MilestoneStatus = 'planned' | 'in_progress' | 'completed' | 'delayed';

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  planned: 'مخطط',
  in_progress: 'جاري التنفيذ',
  completed: 'مكتمل',
  delayed: 'متأخر',
};

export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  planned: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  delayed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  sortOrder: number;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  percentComplete: number;
  weight: number;
  status: MilestoneStatus;
  linkedRevenueId?: string;
  createdAt: string;
}

export type ChangeOrderType = 'scope_addition' | 'scope_reduction' | 'timeline' | 'other';
export type ChangeOrderStatus = 'proposed' | 'approved' | 'rejected';

export const CHANGE_ORDER_TYPE_LABELS: Record<ChangeOrderType, string> = {
  scope_addition: 'إضافة نطاق',
  scope_reduction: 'تقليص نطاق',
  timeline: 'تعديل مدة',
  other: 'أخرى',
};

export const CHANGE_ORDER_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  proposed: 'مقترح',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

export const CHANGE_ORDER_STATUS_COLORS: Record<ChangeOrderStatus, string> = {
  proposed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface ChangeOrder {
  id: string;
  projectId: string;
  description: string;
  changeType: ChangeOrderType;
  amountImpact: number;
  durationImpact: number;
  status: ChangeOrderStatus;
  requestedBy?: string;
  approvedBy?: string;
  approvedDate?: string;
  createdAt: string;
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
  // Contract indicators
  contractValue: number;
  effectiveContractValue: number;
  contractRemaining: number;

  // Budget indicators
  totalPlanned: number;
  totalActual: number;
  budgetRemaining: number;
  budgetVariance: number;

  // Profit indicators
  plannedProfit: number;
  plannedProfitMargin: number;

  // Revenue indicators
  collectedRevenue: number;
  invoicedRevenue: number;
  totalPlannedRevenue: number;
  realizedProfit: number;
  realizedProfitMargin: number;
  accountsReceivable: number;

  // Performance indicators
  spendRate: number;
  contractSpendRate: number;
  burnRate: number;
  percentComplete: number;
}

export interface EVMMetrics {
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  cv: number;
  sv: number;
  cpi: number;
  spi: number;
  eac: number;
  etc: number;
  vac: number;
}

export interface MonthlyCashFlow {
  month: number;
  plannedExpenses: number;
  actualExpenses: number;
  plannedRevenue: number;
  actualRevenue: number;
  netPlanned: number;
  netActual: number;
  cumulativePlanned: number;
  cumulativeActual: number;
}
