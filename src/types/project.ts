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
  planning:         'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  pending_approval: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  active:           'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'on-hold':        'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  completed:        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  archived:         'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  cancelled:        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
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
  taxPercent: number;
  vatInclusive: boolean;
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
  receivedDate?: string;
  closedDate?: string;
  status: 'active' | 'closed';
  sourceFundId?: string;
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
  isVatExempt: boolean;
  fundId?: string;
  /** سلفة موظف لم تُسوَّ بعد — لا تُحتسب ضمن AC في تقارير الأداء حتى التسوية. */
  isOutstandingAdvance?: boolean;
  commitmentId?: string;
  /** مصروف ناتج عن تسوية سلفة — يُشير إلى طلب الصرف الأصلي. */
  sourcePaymentRequestId?: string;
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
  milestoneId?: string;
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

export interface ChangeOrderBudgetItem {
  category: ExpenseCategory;
  description: string;
  plannedAmount: number;
  costType: CostType;
  startMonth?: number;
  endMonth?: number;
}

export interface ChangeOrder {
  id: string; projectId: string; description: string; changeType: ChangeOrderType;
  amountImpact: number; durationImpact: number; status: ChangeOrderStatus;
  requestedBy?: string; approvedBy?: string; approvedDate?: string; createdAt: string;
  budgetItems?: ChangeOrderBudgetItem[];
  autoRebaseline?: boolean;
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

// ======== Commitment Types ========
export type CommitmentStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  draft: 'مسودة', active: 'نشط', completed: 'مكتمل', cancelled: 'ملغي',
};
export const COMMITMENT_STATUS_COLORS: Record<CommitmentStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};
export interface Commitment {
  id: string;
  projectId: string;
  budgetItemId?: string;
  description: string;
  vendorName?: string;
  contractRef?: string;
  totalAmount: number;
  spentAmount: number;
  status: CommitmentStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
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
  vatRate: number;
  contractValueInclVAT: number;
  totalActualInclVAT: number;
  totalVATOnExpenses: number;
  totalVATOnRevenues: number;
  netVATPayable: number;
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

// ─── Budget Amendments (تعديلات الموازنة بعد قفل خط الأساس) ───
export type BudgetAmendmentStatus = 'draft' | 'approved' | 'cancelled';

export const BUDGET_AMENDMENT_STATUS_LABELS: Record<BudgetAmendmentStatus, string> = {
  draft: 'قيد التعديل',
  approved: 'معتمد',
  cancelled: 'ملغي',
};

export const BUDGET_AMENDMENT_STATUS_COLORS: Record<BudgetAmendmentStatus, string> = {
  draft:     'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export interface BudgetAmendmentSnapshotItem {
  id?: string;
  category: string;
  description: string;
  plannedAmount: number;
  startMonth?: number;
  endMonth?: number;
  month?: number;
  costType?: string;
  costClass?: string;
  resourceId?: string;
}

export interface BudgetAmendment {
  id: string;
  projectId: string;
  reason: string;
  snapshotBefore: BudgetAmendmentSnapshotItem[];
  snapshotAfter?: BudgetAmendmentSnapshotItem[];
  totalBefore: number;
  totalAfter?: number;
  status: BudgetAmendmentStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Revolving Fund Management (إدارة صرفيات المشروع) ───
export type FundStatus = 'transferred' | 'acknowledged' | 'settled' | 'pending_next';
export type SettlementStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export const FUND_STATUS_LABELS: Record<FundStatus, string> = {
  transferred: 'محوّلة',
  acknowledged: 'مُقَرّ بالاستلام',
  settled: 'مسوّاة',
  pending_next: 'بانتظار الدفعة التالية',
};

export const FUND_STATUS_COLORS: Record<FundStatus, string> = {
  transferred:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  acknowledged: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  settled:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending_next: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: 'مسودة',
  submitted: 'مُرسلة للاعتماد',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
};

export const SETTLEMENT_STATUS_COLORS: Record<SettlementStatus, string> = {
  draft:     'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface ProjectFund {
  id: string;
  projectId: string;
  fundNumber: number;
  amount: number;
  transferDate: string;
  status: FundStatus;
  notes?: string;
  createdBy: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FundSettlementAttachment {
  name: string;
  url?: string;
  uploadedAt?: string;
}

export interface FundSettlement {
  id: string;
  fundId: string;
  projectId: string;
  totalReceived: number;
  totalSpent: number;
  remainingCash: number;
  difference: number;
  settledBy?: string;
  approvedBy?: string;
  settlementDate?: string;
  approvalDate?: string;
  status: SettlementStatus;
  rejectionReason?: string;
  differenceReason?: string;
  attachments: FundSettlementAttachment[];
  createdAt: string;
  updatedAt: string;
}

/**
 * تحويل نقد من النقد المتبقي بيد المدير (دفعة مصدر) إلى عهدة موجودة.
 * لا يُعدّ مصروفاً — يُنقص رصيد الدفعة المصدر ويزيد رصيد العهدة المستهدفة.
 */
export interface CashTransfer {
  id: string;
  projectId: string;
  fromFundId: string;
  toCustodyId: string;
  amount: number;
  transferDate: string;
  notes?: string;
  createdAt: string;
}



export interface FundAlert {
  id: string;
  type: 'unsettled_long' | 'low_balance' | 'unsettled_block' | 'expense_unlinked' | 'unexplained_diff';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  projectId: string;
  fundId?: string;
  settlementId?: string;
  actionLabel?: string;
}

// ─── Resource Payables (مستحقات الموارد البشرية) ───
export type ReimbursementStatus = 'pending_review' | 'approved' | 'reimbursed' | 'rejected';

export const REIMBURSEMENT_STATUS_LABELS: Record<ReimbursementStatus, string> = {
  pending_review: 'قيد المراجعة',
  approved: 'معتمد',
  reimbursed: 'مدفوع',
  rejected: 'مرفوض',
};

export const REIMBURSEMENT_STATUS_COLORS: Record<ReimbursementStatus, string> = {
  pending_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  reimbursed:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected:       'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export interface ReceiptAttachment {
  name: string;
  url?: string;
  uploadedAt?: string;
}

export interface ResourceReimbursement {
  id: string;
  projectId: string;
  resourceId: string;
  category: ExpenseCategory | string;
  description: string;
  amount: number;
  expenseDate: string;
  receiptAttachments: ReceiptAttachment[];
  budgetItemId?: string;
  status: ReimbursementStatus;
  notes?: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  paymentRequestId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentRequestType = 'reimbursement' | 'salary' | 'bonus' | 'advance' | 'fund_top_up' | 'other';

export const PAYMENT_REQUEST_TYPE_LABELS: Record<PaymentRequestType, string> = {
  reimbursement: 'استرداد مصاريف',
  salary: 'راتب',
  bonus: 'مكافأة',
  advance: 'سلفة',
  fund_top_up: 'تغذية عُهدة',
  other: 'أخرى',
};

export type PaymentRequestStatus =
  | 'draft' | 'submitted' | 'under_review' | 'approved'
  | 'rejected' | 'scheduled' | 'paid' | 'cancelled';

export const PAYMENT_REQUEST_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  draft: 'مسودة',
  submitted: 'مُرسل',
  under_review: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  scheduled: 'مجدول',
  paid: 'مدفوع',
  cancelled: 'ملغي',
};

export const PAYMENT_REQUEST_STATUS_COLORS: Record<PaymentRequestStatus, string> = {
  draft:        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  submitted:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  approved:     'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  rejected:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  scheduled:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  paid:         'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled:    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

export type PaymentPriority = 'normal' | 'urgent' | 'critical';

export const PAYMENT_PRIORITY_LABELS: Record<PaymentPriority, string> = {
  normal: 'عادية',
  urgent: 'عاجل',
  critical: 'حرج',
};

export const PAYMENT_PRIORITY_COLORS: Record<PaymentPriority, string> = {
  normal:   'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  urgent:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export type PaymentMethod = 'bank_transfer' | 'cash' | 'check' | 'card';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  check: 'شيك',
  card: 'بطاقة',
};

export type AdvanceSettlementType = 'documented' | 'cash_refund' | 'payroll_deduction' | 'written_off';

export const ADVANCE_SETTLEMENT_TYPE_LABELS: Record<AdvanceSettlementType, string> = {
  documented: 'تسوية بمستندات (تتحول لمصروف فعلي)',
  cash_refund: 'رد نقدي (يعود للدفعة/العهدة)',
  payroll_deduction: 'خصم من راتب/مستحقات',
  written_off: 'شطب (دين معدوم)',
};

export type SettlementEventType =
  | 'cash_refund'
  | 'documented'
  | 'payroll_deduction'
  | 'written_off'
  | 'reverse';

export interface SettlementEvent {
  id: string;
  paymentRequestId: string;
  projectId: string;
  eventType: SettlementEventType;
  amount: number;
  refundToFundId?: string | null;
  refundToCustodyId?: string | null;
  expenseId?: string | null;
  expenseCategory?: string | null;
  budgetItemId?: string | null;
  notes?: string | null;
  reversedEventId?: string | null;
  overflowExpenseId?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PaymentRequest {
  id: string;
  projectId: string;
  resourceId: string;
  requestType: PaymentRequestType;
  amount: number;
  currency: string;
  description: string;
  justification?: string;
  linkedReimbursementIds: string[];
  linkedFundId?: string;
  paidFromFundId?: string;
  paidFromCustodyId?: string;
  budgetItemId?: string;
  priority: PaymentPriority;
  status: PaymentRequestStatus;
  requestedBy: string;
  requestedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  scheduledDate?: string;
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paymentAttachments: ReceiptAttachment[];
  rejectionReason?: string;
  autoCreatedExpenseId?: string;
  /** سلفة لم تُسوَّ بعد — تُعامل كذمة مدينة على المورد ولا تظهر في المصروفات. */
  isAdvanceOutstanding?: boolean;
  advanceSettledAt?: string;
  advanceSettledBy?: string;
  /** نوع التسوية المنفذ على السلفة بعد إغلاقها. */
  settlementType?: AdvanceSettlementType;
  settledAmount?: number;
  settlementNotes?: string;
  /** عند نوع cash_refund: الدفعة/العهدة التي عاد إليها المبلغ. */
  refundToFundId?: string;
  refundToCustodyId?: string;
  /** مجموع المبلغ المُعاد فعلياً (يدعم الردود الجزئية). */
  refundedAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export type ResourceSettlementStatus = 'draft' | 'signed' | 'disputed' | 'cancelled';

export const RESOURCE_SETTLEMENT_STATUS_LABELS: Record<ResourceSettlementStatus, string> = {
  draft: 'مسودة',
  signed: 'موقّعة',
  disputed: 'متنازع عليها',
  cancelled: 'ملغية',
};

export const RESOURCE_SETTLEMENT_STATUS_COLORS: Record<ResourceSettlementStatus, string> = {
  draft:     'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  signed:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  disputed:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

export interface ResourceSettlement {
  id: string;
  resourceId: string;
  projectId?: string;
  periodFrom?: string;
  periodTo?: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  linkedReimbursementIds: string[];
  linkedPaymentIds: string[];
  settlementTextAr?: string;
  status: ResourceSettlementStatus;
  signedByResource: boolean;
  signatureAttachment?: string;
  signedAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

