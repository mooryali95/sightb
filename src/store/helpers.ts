import { supabase } from '@/integrations/supabase/client';
import { Company, Portfolio, Project, BudgetItem, Expense, Revenue, CostBaseline, BaselineItem, Resource, Custody } from '@/types/project';
import type { Tables } from '@/integrations/supabase/types';

// ---- getUserId ----
export async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ---- Audit log helper ----
export async function logDeletion(tableName: string, recordId: string, recordData: unknown, projectId?: string) {
  try {
    const userId = await getUserId();
    await supabase.from('audit_log').insert([{
      user_id: userId,
      action: 'delete',
      table_name: tableName,
      record_id: recordId,
      record_data: recordData as Record<string, unknown>,
      project_id: projectId || null,
    }]);
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}

// ---- Mappers ----
export function mapCompany(d: Tables<'companies'>): Company {
  return { id: d.id, name: d.name, description: d.description || undefined, logo: d.logo || undefined, createdAt: d.created_at };
}

export function mapPortfolio(d: Tables<'portfolios'>): Portfolio {
  return { id: d.id, companyId: d.company_id, name: d.name, description: d.description || undefined, createdAt: d.created_at };
}

export function mapProject(d: Tables<'projects'>): Project {
  return {
    id: d.id, companyId: d.company_id, portfolioId: d.portfolio_id || undefined,
    name: d.name, description: d.description || undefined,
    contractValue: Number(d.contract_value), currency: d.currency,
    startDate: d.start_date || '', endDate: d.end_date || '',
    durationMonths: d.duration_months, resourceCount: d.resource_count,
    status: d.status as Project['status'], clientLogo: d.client_logo || undefined, createdAt: d.created_at,
  };
}

export function mapBudgetItem(d: Tables<'budget_items'>): BudgetItem {
  return { id: d.id, projectId: d.project_id, category: d.category as BudgetItem['category'], description: d.description, plannedAmount: Number(d.planned_amount), month: d.month || undefined, resourceId: d.resource_id || undefined };
}

export function mapExpense(d: Tables<'expenses'>): Expense {
  return {
    id: d.id, projectId: d.project_id, budgetItemId: d.budget_item_id || undefined,
    category: d.category as Expense['category'], description: d.description, amount: Number(d.amount),
    date: d.date, month: d.month, responsible: d.responsible || undefined, notes: d.notes || undefined,
    resourceId: d.resource_id || undefined, custodyId: d.custody_id || undefined,
  };
}

export function mapResource(d: Tables<'resources'>): Resource {
  return {
    id: d.id, projectId: d.project_id, name: d.name,
    role: d.role || undefined, monthlyCost: Number(d.monthly_cost), createdAt: d.created_at,
  };
}

export function mapCustody(d: Tables<'custodies'>, expenses: Expense[]): Custody {
  const spent = expenses.filter(e => e.custodyId === d.id).reduce((s, e) => s + e.amount, 0);
  return {
    id: d.id, projectId: d.project_id || undefined, companyId: d.company_id || undefined,
    resourceName: d.resource_name, amount: Number(d.amount),
    spent, remaining: Number(d.amount) - spent,
    notes: d.notes || undefined, createdAt: d.created_at,
  };
}

export function mapRevenue(d: Tables<'revenues'>): Revenue {
  return { id: d.id, projectId: d.project_id, description: d.description, amount: Number(d.amount), date: d.date, month: d.month };
}

export function mapBaselineItem(d: Tables<'baseline_items'>): BaselineItem {
  return {
    id: d.id, baselineId: d.baseline_id, category: d.category as BaselineItem['category'],
    description: d.description, plannedAmount: Number(d.planned_amount),
    month: d.month || undefined,
  };
}
