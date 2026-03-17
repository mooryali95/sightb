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
  targetRevenue: number;
  targetMargin: number;
  fiscalYear?: string;
  notes?: string;
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
  | 'salary' | 'travel' | 'hotel' | 'food' | 'printing' | 'photography'
  | 'import' | 'training' | 'consulting' | 'media' | 'hospitality'
  | 'equipment' | 'software' | 'contingency' | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salary: 'رواتب موظفين', travel: 'سفر وتنقل', hotel: 'إقامة وفنادق',
  food: 'مطاعم وضيافة', printing: 'طباعة ونسخ', photography: 'تصوير',
  import: 'استيراد', training: 'تدريب وقاعات', consulting: 'استشارات',
  media: 'تغطية إعلامية', hospitality: 'ضيافة', equipment: 'معدات وأجهزة',
  software: 'برمجيات', contingency: 'احتياطي وطوارئ', other: 'أخرى',
};

export type CostType = 'fixed' | 'recurring' | 'one_time';
export type CostClass = 'direct' | 'indirect';

export const COST_TYPE_LABELS: Record<CostType, string> = {
  fixed: 'مبلغ ثابت', recurring: 'متكرر شهرياً', one_time: 'مرة واحدة',
};

export const COST_CLASS_LABELS: Record<CostClass, string> = {
  direct: 'مباشر', indirect: 'غير مباشر',
};

export interface Resource {
  id: string; projectId: string; name: string; role?: string; monthlyCost: number; createdAt: string;
}

export interface Custody {
  id: string; projectId?: string; companyId?: string; resourceName: string;
  amount: number; spent: number; remaining: number; notes?: string; createdAt: string;
}

export interface BudgetItem {
  id: string; projectId: string; category: ExpenseCategory; description: string;
  plannedAmount: number; month?: number; startMonth?: number; endMonth?: number;
  costType: CostType; costClass: CostClass; resourceId?: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'بانتظار الاعتماد', approved: 'معتمد', rejected: 'مرفوض',
};

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface Expense {
  id: string; projectId: string; budgetItemId?: string; category: ExpenseCategory;
  description: string; amount: number; date: string; month: number;
  responsible?: string; notes?: string; resourceId?: string; custodyId?: string;
  approvalStatus: ApprovalStatus; approvedBy?: string; vendor?: string; invoiceRef?: string;
}

export type RevenueType = 'advance' | 'milestone' | 'final' | 'retention' | 'variation' | 'deduction';
export type RevenueStatus = 'planned' | 'invoiced' | 'collected';

export const REVENUE_TYPE_LABELS: Record<RevenueType, string> = {
  advance: 'دفعة مقدمة', milestone: 'دفعة مرحلية', final: 'دفعة ختامية',
  retention: 'إفراج محتجزات', variation: 'أعمال إضافية', deduction: 'خصم',
};

export const REVENUE_STATUS_LABELS: Record<RevenueStatus, string> = {
  planned: 'مخطط', invoiced: 'مُفوتر', collected: 'محصّل',
};

export const REVENUE_STATUS_COLORS: Record<RevenueStatus, string> = {
  planned: 'bg-muted text-muted-foreground',
  invoiced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  collected: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export interface Revenue {
  id: string; projectId: string; description: string; amount: number;
  date: string; month: number; revenueType: RevenueType; status: RevenueStatus;
  invoiceNumber?: string; invoiceDate?: string; collectionDate?: string;
}

export type MilestoneStatus = 'planned' | 'in_progress' | 'completed' | 'delayed';

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  planned: 'مخطط', in_progress: 'جاري التنفيذ', completed: 'مكتمل', delayed: 'متأخر',
};

export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  planned: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  delayed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface Milestone {
  id: string; projectId: string; name: string; description?: string;
  sortOrder: number; plannedStart?: string; plannedEnd?: string;
  actualStart?: string; actualEnd?: string; percentComplete: number;
  weight: number; status: MilestoneStatus; linkedRevenueId?: string; createdAt: string;
}

export type ChangeOrderType = 'scope_addition' | 'scope_reduction' | 'timeline' | 'other';
export type ChangeOrderStatus = 'proposed' | 'approved' | 'rejected';

export const CHANGE_ORDER_TYPE_LABELS: Record<ChangeOrderType, string> = {
  scope_addition: 'إضافة نطاق', scope_reduction: 'تقليص نطاق', timeline: 'تعديل مدة', other: 'أخرى',
};

export const CHANGE_ORDER_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  proposed: 'مقترح', approved: 'معتمد', rejected: 'مرفوض',
};

export const CHANGE_ORDER_STATUS_COLORS: Record<ChangeOrderStatus, string> = {
  proposed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface ChangeOrder {
  id: string; projectId: string; description: string; changeType: ChangeOrderType;
  amountImpact: number; durationImpact: number; status: ChangeOrderStatus;
  requestedBy?: string; approvedBy?: string; approvedDate?: string; createdAt: string;
}

export interface CostBaseline {
  id: string; projectId: string; name: string; version: number;
  isActive: boolean; totalPlanned: number; createdAt: string; items: BaselineItem[];
}

export interface BaselineItem {
  id: string; baselineId: string; category: ExpenseCategory;
  description: string; plannedAmount: number; month?: number;
  startMonth?: number; endMonth?: number; costType: CostType;
}

// ======== Risk Types ========
export type RiskProbability = 'low' | 'medium' | 'high' | 'very_high';
export type RiskImpact = 'low' | 'medium' | 'high' | 'very_high';
export type RiskCategory = 'financial' | 'schedule' | 'resource' | 'scope' | 'external';
export type RiskStatus = 'open' | 'mitigating' | 'closed' | 'occurred';

export const RISK_PROBABILITY_LABELS: Record<RiskProbability, string> = {
  low: 'منخفض', medium: 'متوسط', high: 'مرتفع', very_high: 'مرتفع جداً',
};

export const RISK_IMPACT_LABELS: Record<RiskImpact, string> = {
  low: 'منخفض', medium: 'متوسط', high: 'مرتفع', very_high: 'مرتفع جداً',
};

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  financial: 'مالي', schedule: 'زمني', resource: 'موارد', scope: 'نطاق', external: 'خارجي',
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: 'مفتوح', mitigating: 'قيد المعالجة', closed: 'مغلق', occurred: 'وقع',
};

export const RISK_PROBABILITY_COLORS: Record<RiskProbability, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  very_high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const RISK_IMPACT_COLORS: Record<RiskImpact, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  very_high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const RISK_STATUS_COLORS: Record<RiskStatus, string> = {
  open: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  mitigating: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  closed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  occurred: 'bg-destructive/10 text-destructive',
};

export interface Risk {
  id: string;
  projectId?: string;
  portfolioId?: string;
  title: string;
  description?: string;
  probability: RiskProbability;
  impact: RiskImpact;
  financialImpact: number;
  category: RiskCategory;
  status: RiskStatus;
  mitigationPlan?: string;
  owner?: string;
  identifiedDate?: string;
  closedDate?: string;
  createdAt: string;
}

// ======== Indirect Cost Types ========
export type IndirectCostCategory = 'rent' | 'admin_salary' | 'utilities' | 'insurance' | 'marketing' | 'other';

export const INDIRECT_COST_CATEGORY_LABELS: Record<IndirectCostCategory, string> = {
  rent: 'إيجار', admin_salary: 'رواتب إدارية', utilities: 'مرافق',
  insurance: 'تأمين', marketing: 'تسويق', other: 'أخرى',
};

export interface IndirectCost {
  id: string;
  companyId: string;
  category: IndirectCostCategory;
  description: string;
  amount: number;
  month: number;
  date: string;
  allocationMethod: string;
  createdAt: string;
}

// ======== Periodic Snapshot ========
export interface PeriodicSnapshot {
  id: string;
  entityType: string;
  entityId: string;
  period: string;
  snapshotDate: string;
  metrics: Record<string, any>;
  createdAt: string;
}

// ======== Summary Interfaces ========
export interface ProjectSummary {
  contractValue: number;
  effectiveContractValue: number;
  contractRemaining: number;
  totalPlanned: number;
  totalActual: number;
  budgetRemaining: number;
  /** Budget variance as percentage: ((totalPlanned - totalActual) / totalPlanned) * 100 */
  budgetVariance: number;
  plannedProfit: number;
  plannedProfitMargin: number;
  collectedRevenue: number;
  invoicedRevenue: number;
  totalPlannedRevenue: number;
  realizedProfit: number;
  realizedProfitMargin: number;
  accountsReceivable: number;
  spendRate: number;
  contractSpendRate: number;
  burnRate: number;
  percentComplete: number;
  managementReserve: number;
  bacWithoutReserve: number;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: 'سليم', warning: 'تحذير', critical: 'حرج',
};

export const HEALTH_STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface PortfolioSummary {
  portfolioId: string;
  portfolioName: string;
  projectCount: number;
  totalContractValue: number;
  totalEffectiveValue: number;
  totalPlanned: number;
  totalActual: number;
  totalCollectedRevenue: number;
  totalInvoicedRevenue: number;
  aggregatePlannedProfit: number;
  aggregatePlannedMargin: number;
  aggregateRealizedProfit: number;
  aggregateRealizedMargin: number;
  weightedPercentComplete: number;
  averageCPI: number;
  atRiskProjects: number;
  openRisks: number;
  totalFinancialExposure: number;
  revenueAchievement: number;
  healthStatus: HealthStatus;
}

export interface CompanySummary {
  companyId: string;
  companyName: string;
  portfolioSummaries: PortfolioSummary[];
  standaloneProjectsSummary: PortfolioSummary;
  totalContractValue: number;
  totalActual: number;
  totalPlannedProfit: number;
  totalIndirectCosts: number;
  netProfitAfterIndirect: number;
  netProfitMargin: number;
  totalAtRiskProjects: number;
  healthStatus: HealthStatus;
}

export interface EVMMetrics {
  pv: number; ev: number; ac: number; bac: number;
  cv: number; sv: number; cpi: number; spi: number;
  eac: number; etc: number; vac: number;
  tcpiBAC: number;  // TCPI based on BAC
  tcpiEAC: number;  // TCPI based on EAC
  eacAtypical: number;  // EAC assuming atypical performance (will improve)
  eacCombined: number;  // EAC weighted by CPI × SPI
}

export interface MonthlyCashFlow {
  month: number;
  plannedExpenses: number; actualExpenses: number;
  plannedRevenue: number; actualRevenue: number;
  netPlanned: number; netActual: number;
  cumulativePlanned: number; cumulativeActual: number;
}
