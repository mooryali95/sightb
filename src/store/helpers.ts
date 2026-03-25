import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  Company, Portfolio, Project, BudgetItem, Expense, Revenue,
  CostBaseline, BaselineItem, Resource, Custody, Milestone, ChangeOrder,
  Risk, IndirectCost, PeriodicSnapshot,
  type ChangeOrderBudgetItem,
  type ContractType, type CostType, type CostClass, type RevenueType, type RevenueStatus,
  type MilestoneStatus, type ChangeOrderType, type ChangeOrderStatus,
  type RiskProbability, type RiskImpact, type RiskCategory, type RiskStatus,
  type IndirectCostCategory,
  type CommitmentStatus,
  Commitment,
} from '@/types/project';

// ---- getUserId ----
export async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ---- Audit log helper (DEPRECATED - server-side triggers handle audit logging) ----
// logDeletion is kept as a no-op for backward compatibility with existing imports
export async function logDeletion(_tableName: string, _recordId: string, _recordData: unknown, _projectId?: string) {
  // No-op: audit logging is now handled exclusively by database triggers (audit_delete, audit_update)
}

// ---- Mappers ----
export function mapCompany(d: any): Company {
  return { id: d.id, name: d.name, description: d.description || undefined, logo: d.logo || undefined, status: d.status || 'active', createdAt: d.created_at };
}

export function mapPortfolio(d: any): Portfolio {
  return {
    id: d.id, companyId: d.company_id, name: d.name,
    description: d.description || undefined,
    targetRevenue: Number(d.target_revenue ?? 0),
    targetMargin: Number(d.target_margin ?? 0),
    fiscalYear: d.fiscal_year || undefined,
    notes: d.notes || undefined,
    createdAt: d.created_at,
  };
}

export function mapProject(d: any): Project {
  return {
    id: d.id, companyId: d.company_id, portfolioId: d.portfolio_id || undefined,
    name: d.name, description: d.description || undefined,
    contractValue: Number(d.contract_value), currency: d.currency,
    startDate: d.start_date || '', endDate: d.end_date || '',
    durationMonths: d.duration_months, resourceCount: d.resource_count,
    status: d.status as Project['status'], clientLogo: d.client_logo || undefined, createdAt: d.created_at,
    percentComplete: d.percent_complete ?? 0,
    contractType: (d.contract_type || 'lump_sum') as ContractType,
    retentionPercent: Number(d.retention_percent ?? 0),
    managementReserve: Number(d.management_reserve ?? 0),
    taxPercent: Number(d.tax_percent ?? 15),
    vatInclusive: d.vat_inclusive ?? false,
  };
}

export function mapBudgetItem(d: any): BudgetItem {
  return {
    id: d.id, projectId: d.project_id, category: d.category as BudgetItem['category'],
    description: d.description, plannedAmount: Number(d.planned_amount),
    month: d.month || undefined,
    startMonth: d.start_month || undefined,
    endMonth: d.end_month || undefined,
    costType: (d.cost_type || 'fixed') as CostType,
    costClass: (d.cost_class || 'direct') as CostClass,
    resourceId: d.resource_id || undefined,
  };
}

export function mapExpense(d: any): Expense {
  return {
    id: d.id, projectId: d.project_id, budgetItemId: d.budget_item_id || undefined,
    category: d.category as Expense['category'], description: d.description, amount: Number(d.amount),
    date: d.date, month: d.month, responsible: d.responsible || undefined, notes: d.notes || undefined,
    resourceId: d.resource_id || undefined, custodyId: d.custody_id || undefined,
    approvalStatus: (d.approval_status || 'approved') as Expense['approvalStatus'],
    approvedBy: d.approved_by || undefined,
    vendor: d.vendor || undefined,
    invoiceRef: d.invoice_ref || undefined,
    isVatExempt: d.is_vat_exempt ?? false,
  };
}

export function mapResource(d: any): Resource {
  return {
    id: d.id, projectId: d.project_id, name: d.name,
    role: d.role || undefined, monthlyCost: Number(d.monthly_cost), createdAt: d.created_at,
  };
}

export function mapCustody(d: any, expenses: Expense[]): Custody {
  const spent = expenses.filter(e => e.custodyId === d.id).reduce((s, e) => s + e.amount, 0);
  return {
    id: d.id, projectId: d.project_id || undefined, companyId: d.company_id || undefined,
    resourceName: d.resource_name, amount: Number(d.amount),
    spent, remaining: Number(d.amount) - spent,
    notes: d.notes || undefined, createdAt: d.created_at,
  };
}

export function mapRevenue(d: any): Revenue {
  return {
    id: d.id, projectId: d.project_id, description: d.description,
    amount: Number(d.amount), date: d.date, month: d.month,
    revenueType: (d.revenue_type || 'milestone') as RevenueType,
    status: (d.status || 'collected') as RevenueStatus,
    invoiceNumber: d.invoice_number || undefined,
    invoiceDate: d.invoice_date || undefined,
    collectionDate: d.collection_date || undefined,
  };
}

export function mapBaselineItem(d: any): BaselineItem {
  return {
    id: d.id, baselineId: d.baseline_id, category: d.category as BaselineItem['category'],
    description: d.description, plannedAmount: Number(d.planned_amount),
    month: d.month || undefined,
    startMonth: d.start_month || undefined,
    endMonth: d.end_month || undefined,
    costType: (d.cost_type || 'fixed') as CostType,
  };
}

export function mapMilestone(d: any): Milestone {
  return {
    id: d.id, projectId: d.project_id, name: d.name,
    description: d.description || undefined,
    sortOrder: d.sort_order ?? 0,
    plannedStart: d.planned_start || undefined,
    plannedEnd: d.planned_end || undefined,
    actualStart: d.actual_start || undefined,
    actualEnd: d.actual_end || undefined,
    percentComplete: d.percent_complete ?? 0,
    weight: Number(d.weight ?? 0),
    status: (d.status || 'planned') as MilestoneStatus,
    linkedRevenueId: d.linked_revenue_id || undefined,
    createdAt: d.created_at,
  };
}

export function mapChangeOrder(d: any): ChangeOrder {
  let parsedBudgetItems: ChangeOrderBudgetItem[] = [];
  try {
    const raw = d.budget_items_json;
    if (raw) parsedBudgetItems = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  return {
    id: d.id, projectId: d.project_id, description: d.description,
    changeType: (d.change_type || 'scope_addition') as ChangeOrderType,
    amountImpact: Number(d.amount_impact ?? 0),
    durationImpact: d.duration_impact ?? 0,
    status: (d.status || 'proposed') as ChangeOrderStatus,
    requestedBy: d.requested_by || undefined,
    approvedBy: d.approved_by || undefined,
    approvedDate: d.approved_date || undefined,
    createdAt: d.created_at,
    budgetItems: parsedBudgetItems,
    autoRebaseline: d.auto_rebaseline !== false,
  };
}

export function mapRisk(d: any): Risk {
  return {
    id: d.id,
    projectId: d.project_id || undefined,
    portfolioId: d.portfolio_id || undefined,
    title: d.title,
    description: d.description || undefined,
    probability: (d.probability || 'medium') as RiskProbability,
    impact: (d.impact || 'medium') as RiskImpact,
    financialImpact: Number(d.financial_impact ?? 0),
    category: (d.category || 'financial') as RiskCategory,
    status: (d.status || 'open') as RiskStatus,
    mitigationPlan: d.mitigation_plan || undefined,
    owner: d.owner || undefined,
    identifiedDate: d.identified_date || undefined,
    closedDate: d.closed_date || undefined,
    createdAt: d.created_at,
  };
}

export function mapIndirectCost(d: any): IndirectCost {
  return {
    id: d.id,
    companyId: d.company_id,
    category: (d.category || 'other') as IndirectCostCategory,
    description: d.description,
    amount: Number(d.amount ?? 0),
    month: d.month,
    date: d.date,
    allocationMethod: d.allocation_method || 'equal',
    createdAt: d.created_at,
  };
}

export function mapSnapshot(d: any): PeriodicSnapshot {
  return {
    id: d.id,
    entityType: d.entity_type,
    entityId: d.entity_id,
    period: d.period,
    snapshotDate: d.snapshot_date,
    metrics: d.metrics || {},
    createdAt: d.created_at,
  };
}

export function mapCommitment(d: any): Commitment {
  return {
    id: d.id, projectId: d.project_id,
    budgetItemId: d.budget_item_id || undefined,
    description: d.description,
    vendorName: d.vendor_name || undefined,
    contractRef: d.contract_ref || undefined,
    totalAmount: Number(d.total_amount ?? 0),
    spentAmount: Number(d.spent_amount ?? 0),
    status: (d.status || 'active') as CommitmentStatus,
    startDate: d.start_date || undefined,
    endDate: d.end_date || undefined,
    notes: d.notes || undefined,
    createdAt: d.created_at,
  };
}
