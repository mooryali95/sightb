import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  Company, Portfolio, Project, BudgetItem, Expense, Revenue,
  CostBaseline, Resource, Custody, Milestone, ChangeOrder,
  Risk, IndirectCost, PeriodicSnapshot,
} from '@/types/project';
import {
  getUserId, logDeletion,
  mapCompany, mapPortfolio, mapProject, mapBudgetItem,
  mapExpense, mapResource, mapCustody, mapRevenue, mapBaselineItem,
  mapMilestone, mapChangeOrder, mapRisk, mapIndirectCost, mapSnapshot,
} from './helpers';

export interface AuditLogEntry {
  id: string; userId: string; action: string; tableName: string;
  recordId: string; recordData: any; projectId?: string; createdAt: string;
}

// ---- Slice types ----
interface DataState {
  companies: Company[];
  portfolios: Portfolio[];
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  baselines: CostBaseline[];
  resources: Resource[];
  custodies: Custody[];
  milestones: Milestone[];
  changeOrders: ChangeOrder[];
  risks: Risk[];
  indirectCosts: IndirectCost[];
  snapshots: PeriodicSnapshot[];
  auditLog: AuditLogEntry[];
  loading: boolean;
}

interface LoadActions {
  loadAll: () => Promise<void>;
  loadAuditLog: (projectId: string) => Promise<void>;
}

interface CompanyActions {
  addCompany: (c: Omit<Company, 'id' | 'createdAt'>) => Promise<string>;
  updateCompany: (id: string, c: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  archiveCompany: (id: string) => Promise<void>;
  unarchiveCompany: (id: string) => Promise<void>;
}

interface PortfolioActions {
  addPortfolio: (p: Omit<Portfolio, 'id' | 'createdAt'>) => Promise<string>;
  updatePortfolio: (id: string, p: Partial<Portfolio>) => Promise<void>;
  deletePortfolio: (id: string) => Promise<void>;
}

interface ProjectActions {
  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => Promise<string>;
  updateProject: (id: string, p: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

interface BudgetActions {
  addBudgetItem: (b: Omit<BudgetItem, 'id'>) => Promise<string>;
  updateBudgetItem: (id: string, b: Partial<BudgetItem>) => Promise<void>;
  deleteBudgetItem: (id: string) => Promise<void>;
}

interface ExpenseActions {
  addExpense: (e: Omit<Expense, 'id'>) => Promise<string>;
  updateExpense: (id: string, e: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}

interface RevenueActions {
  addRevenue: (r: Omit<Revenue, 'id'>) => Promise<string>;
  updateRevenue: (id: string, r: Partial<Revenue>) => Promise<void>;
  deleteRevenue: (id: string) => Promise<void>;
}

interface ResourceActions {
  addResource: (r: Omit<Resource, 'id' | 'createdAt'>) => Promise<string>;
  updateResource: (id: string, r: Partial<Resource>) => Promise<void>;
  deleteResource: (id: string) => Promise<void>;
}

interface CustodyActions {
  addCustody: (c: Omit<Custody, 'id' | 'createdAt' | 'spent' | 'remaining'>) => Promise<string>;
  deleteCustody: (id: string) => Promise<void>;
}

interface BaselineActions {
  createBaseline: (projectId: string, name: string) => Promise<string>;
  deleteBaseline: (id: string) => Promise<void>;
  setActiveBaseline: (id: string, projectId: string) => Promise<void>;
  loadBaselines: (projectId: string) => Promise<CostBaseline[]>;
}

interface MilestoneActions {
  addMilestone: (m: Omit<Milestone, 'id' | 'createdAt'>) => Promise<string>;
  updateMilestone: (id: string, m: Partial<Milestone>) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;
}

interface ChangeOrderActions {
  addChangeOrder: (co: Omit<ChangeOrder, 'id' | 'createdAt'>) => Promise<string>;
  updateChangeOrder: (id: string, co: Partial<ChangeOrder>) => Promise<void>;
  deleteChangeOrder: (id: string) => Promise<void>;
}

interface RiskActions {
  addRisk: (r: Omit<Risk, 'id' | 'createdAt'>) => Promise<string>;
  updateRisk: (id: string, r: Partial<Risk>) => Promise<void>;
  deleteRisk: (id: string) => Promise<void>;
}

interface IndirectCostActions {
  addIndirectCost: (ic: Omit<IndirectCost, 'id' | 'createdAt'>) => Promise<string>;
  updateIndirectCost: (id: string, ic: Partial<IndirectCost>) => Promise<void>;
  deleteIndirectCost: (id: string) => Promise<void>;
}

interface SnapshotActions {
  saveSnapshot: (s: Omit<PeriodicSnapshot, 'id' | 'createdAt'>) => Promise<string>;
  loadSnapshots: (entityType: string, entityId: string) => Promise<PeriodicSnapshot[]>;
}

type AppState = DataState & LoadActions & CompanyActions & PortfolioActions & ProjectActions &
  BudgetActions & ExpenseActions & RevenueActions & ResourceActions & CustodyActions & BaselineActions &
  MilestoneActions & ChangeOrderActions & RiskActions & IndirectCostActions & SnapshotActions;

export const useStore = create<AppState>()((set, get) => ({
  // ---- Initial state ----
  companies: [], portfolios: [], projects: [], budgetItems: [], expenses: [],
  revenues: [], baselines: [], resources: [], custodies: [], milestones: [],
  changeOrders: [], risks: [], indirectCosts: [], snapshots: [],
  auditLog: [], loading: true,

  // ---- Load slice ----
  loadAll: async () => {
    set({ loading: true });
    const [companies, portfolios, projects, budgetItems, expenses, revenues, resources, custodies, milestones, changeOrders, risks, indirectCosts] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('portfolios').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('budget_items').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('revenues').select('*').order('created_at', { ascending: false }),
      supabase.from('resources').select('*').order('created_at', { ascending: false }),
      supabase.from('custodies').select('*').order('created_at', { ascending: false }),
      supabase.from('milestones').select('*').order('sort_order', { ascending: true }),
      supabase.from('change_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('risks').select('*').order('created_at', { ascending: false }),
      supabase.from('indirect_costs').select('*').order('created_at', { ascending: false }),
    ]);

    const expenseList = (expenses.data || []).map(mapExpense);

    set({
      companies: (companies.data || []).map(mapCompany),
      portfolios: (portfolios.data || []).map(mapPortfolio),
      projects: (projects.data || []).map(mapProject),
      budgetItems: (budgetItems.data || []).map(mapBudgetItem),
      expenses: expenseList,
      revenues: (revenues.data || []).map(mapRevenue),
      resources: (resources.data || []).map(mapResource),
      custodies: (custodies.data || []).map((c) => mapCustody(c, expenseList)),
      milestones: (milestones.data || []).map(mapMilestone),
      changeOrders: (changeOrders.data || []).map(mapChangeOrder),
      risks: (risks.data || []).map(mapRisk),
      indirectCosts: (indirectCosts.data || []).map(mapIndirectCost),
      loading: false,
    });
  },

  loadAuditLog: async (projectId: string) => {
    const { data } = await supabase
      .from('audit_log').select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100);
    set({
      auditLog: (data || []).map((d) => ({
        id: d.id, userId: d.user_id, action: d.action,
        tableName: d.table_name, recordId: d.record_id,
        recordData: d.record_data, projectId: d.project_id || undefined,
        createdAt: d.created_at,
      })),
    });
  },

  // ---- Company slice ----
  addCompany: async (c) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('companies').insert({
      user_id: userId, name: c.name, description: c.description || null, logo: c.logo || null, status: 'active',
    }).select().single();
    if (error) throw error;
    const mapped = mapCompany(data);
    set((s) => ({ companies: [mapped, ...s.companies] }));
    return mapped.id;
  },

  updateCompany: async (id, c) => {
    const updates: Record<string, unknown> = {};
    if (c.name !== undefined) updates.name = c.name;
    if (c.description !== undefined) updates.description = c.description;
    if (c.logo !== undefined) updates.logo = c.logo;
    if (c.status !== undefined) updates.status = c.status;
    const { error } = await (supabase as any).from('companies').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, ...c } : x)) }));
  },

  deleteCompany: async (id) => {
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({
      companies: s.companies.filter((x) => x.id !== id),
      portfolios: s.portfolios.filter((x) => x.companyId !== id),
      projects: s.projects.filter((x) => x.companyId !== id),
    }));
  },

  archiveCompany: async (id) => {
    const { error } = await (supabase as any).from('companies').update({ status: 'archived' }).eq('id', id);
    if (error) throw error;
    set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, status: 'archived' as const } : x)) }));
  },

  unarchiveCompany: async (id) => {
    const { error } = await (supabase as any).from('companies').update({ status: 'active' }).eq('id', id);
    if (error) throw error;
    set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, status: 'active' as const } : x)) }));
  },

  // ---- Portfolio slice ----
  addPortfolio: async (p) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('portfolios').insert({
      user_id: userId, company_id: p.companyId, name: p.name,
      description: p.description || null,
      target_revenue: p.targetRevenue || 0,
      target_margin: p.targetMargin || 0,
      fiscal_year: p.fiscalYear || null,
      notes: p.notes || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapPortfolio(data);
    set((s) => ({ portfolios: [mapped, ...s.portfolios] }));
    return mapped.id;
  },

  updatePortfolio: async (id, p) => {
    const updates: Record<string, unknown> = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.description !== undefined) updates.description = p.description;
    if (p.companyId !== undefined) updates.company_id = p.companyId;
    if (p.targetRevenue !== undefined) updates.target_revenue = p.targetRevenue;
    if (p.targetMargin !== undefined) updates.target_margin = p.targetMargin;
    if (p.fiscalYear !== undefined) updates.fiscal_year = p.fiscalYear;
    if (p.notes !== undefined) updates.notes = p.notes;
    const { error } = await (supabase as any).from('portfolios').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ portfolios: s.portfolios.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  },

  deletePortfolio: async (id) => {
    const { error } = await supabase.from('portfolios').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({
      portfolios: s.portfolios.filter((x) => x.id !== id),
      projects: s.projects.map((x) => (x.portfolioId === id ? { ...x, portfolioId: undefined } : x)),
    }));
  },

  // ---- Project slice ----
  addProject: async (p) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('projects').insert({
      user_id: userId, company_id: p.companyId,
      portfolio_id: p.portfolioId === 'none' ? null : (p.portfolioId || null),
      name: p.name, description: p.description || null,
      contract_value: p.contractValue, currency: p.currency,
      start_date: p.startDate || null, end_date: p.endDate || null,
      duration_months: p.durationMonths, resource_count: p.resourceCount,
      status: p.status, client_logo: p.clientLogo || null,
      contract_type: p.contractType || 'lump_sum',
      retention_percent: p.retentionPercent || 0,
      management_reserve: p.managementReserve || 0,
    } as any).select().single();
    if (error) throw error;
    const mapped = mapProject(data);
    set((s) => ({ projects: [mapped, ...s.projects] }));
    return mapped.id;
  },

  updateProject: async (id, p) => {
    const updates: Record<string, unknown> = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.description !== undefined) updates.description = p.description;
    if (p.companyId !== undefined) updates.company_id = p.companyId;
    if (p.portfolioId !== undefined) updates.portfolio_id = p.portfolioId;
    if (p.contractValue !== undefined) updates.contract_value = p.contractValue;
    if (p.currency !== undefined) updates.currency = p.currency;
    if (p.startDate !== undefined) updates.start_date = p.startDate;
    if (p.endDate !== undefined) updates.end_date = p.endDate;
    if (p.durationMonths !== undefined) updates.duration_months = p.durationMonths;
    if (p.resourceCount !== undefined) updates.resource_count = p.resourceCount;
    if (p.status !== undefined) updates.status = p.status;
    if (p.percentComplete !== undefined) updates.percent_complete = p.percentComplete;
    if (p.contractType !== undefined) updates.contract_type = p.contractType;
    if (p.retentionPercent !== undefined) updates.retention_percent = p.retentionPercent;
    if (p.managementReserve !== undefined) updates.management_reserve = p.managementReserve;
    const { error } = await (supabase as any).from('projects').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  },

  deleteProject: async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({
      projects: s.projects.filter((x) => x.id !== id),
      budgetItems: s.budgetItems.filter((x) => x.projectId !== id),
      expenses: s.expenses.filter((x) => x.projectId !== id),
      revenues: s.revenues.filter((x) => x.projectId !== id),
    }));
  },

  // ---- Budget slice ----
  addBudgetItem: async (b) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('budget_items').insert({
      user_id: userId, project_id: b.projectId, category: b.category,
      description: b.description, planned_amount: b.plannedAmount,
      month: b.month || null, resource_id: b.resourceId || null,
      start_month: b.startMonth || null, end_month: b.endMonth || null,
      cost_type: b.costType || 'fixed', cost_class: b.costClass || 'direct',
    }).select().single();
    if (error) throw error;
    const mapped = mapBudgetItem(data);
    set((s) => ({ budgetItems: [mapped, ...s.budgetItems] }));
    return mapped.id;
  },

  updateBudgetItem: async (id, b) => {
    const updates: Record<string, unknown> = {};
    if (b.category !== undefined) updates.category = b.category;
    if (b.description !== undefined) updates.description = b.description;
    if (b.plannedAmount !== undefined) updates.planned_amount = b.plannedAmount;
    if (b.month !== undefined) updates.month = b.month;
    if (b.startMonth !== undefined) updates.start_month = b.startMonth;
    if (b.endMonth !== undefined) updates.end_month = b.endMonth;
    if (b.costType !== undefined) updates.cost_type = b.costType;
    if (b.costClass !== undefined) updates.cost_class = b.costClass;
    if (b.resourceId !== undefined) updates.resource_id = b.resourceId;
    const { error } = await (supabase as any).from('budget_items').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ budgetItems: s.budgetItems.map((x) => (x.id === id ? { ...x, ...b } : x)) }));
  },

  deleteBudgetItem: async (id) => {
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ budgetItems: s.budgetItems.filter((x) => x.id !== id) }));
  },

  // ---- Expense slice ----
  addExpense: async (e) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('expenses').insert({
      user_id: userId, project_id: e.projectId,
      budget_item_id: e.budgetItemId || null,
      category: e.category, description: e.description,
      amount: e.amount, date: e.date, month: e.month,
      responsible: e.responsible || null, notes: e.notes || null,
      resource_id: e.resourceId || null, custody_id: e.custodyId || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapExpense(data);
    set((s) => ({ expenses: [mapped, ...s.expenses] }));
    return mapped.id;
  },

  updateExpense: async (id, e) => {
    const updates: Record<string, unknown> = {};
    if (e.category !== undefined) updates.category = e.category;
    if (e.description !== undefined) updates.description = e.description;
    if (e.amount !== undefined) updates.amount = e.amount;
    if (e.date !== undefined) updates.date = e.date;
    if (e.month !== undefined) updates.month = e.month;
    if (e.responsible !== undefined) updates.responsible = e.responsible;
    if (e.notes !== undefined) updates.notes = e.notes;
    if (e.budgetItemId !== undefined) updates.budget_item_id = e.budgetItemId;
    const { error } = await supabase.from('expenses').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.map((x) => (x.id === id ? { ...x, ...e } : x)) }));
  },

  deleteExpense: async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
  },

  // ---- Revenue slice ----
  addRevenue: async (r) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('revenues').insert({
      user_id: userId, project_id: r.projectId,
      description: r.description, amount: r.amount, date: r.date, month: r.month,
      revenue_type: r.revenueType || 'milestone',
      status: r.status || 'collected',
      invoice_number: r.invoiceNumber || null,
      invoice_date: r.invoiceDate || null,
      collection_date: r.collectionDate || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapRevenue(data);
    set((s) => ({ revenues: [mapped, ...s.revenues] }));
    return mapped.id;
  },

  updateRevenue: async (id, r) => {
    const updates: Record<string, unknown> = {};
    if (r.description !== undefined) updates.description = r.description;
    if (r.amount !== undefined) updates.amount = r.amount;
    if (r.date !== undefined) updates.date = r.date;
    if (r.month !== undefined) updates.month = r.month;
    if (r.revenueType !== undefined) updates.revenue_type = r.revenueType;
    if (r.status !== undefined) updates.status = r.status;
    if (r.invoiceNumber !== undefined) updates.invoice_number = r.invoiceNumber;
    if (r.invoiceDate !== undefined) updates.invoice_date = r.invoiceDate;
    if (r.collectionDate !== undefined) updates.collection_date = r.collectionDate;
    const { error } = await (supabase as any).from('revenues').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ revenues: s.revenues.map((x) => (x.id === id ? { ...x, ...r } : x)) }));
  },

  deleteRevenue: async (id) => {
    const { error } = await supabase.from('revenues').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ revenues: s.revenues.filter((x) => x.id !== id) }));
  },

  // ---- Resource slice ----
  addResource: async (r) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('resources').insert({
      user_id: userId, project_id: r.projectId,
      name: r.name, role: r.role || null, monthly_cost: r.monthlyCost,
    }).select().single();
    if (error) throw error;
    const mapped = mapResource(data);
    set((s) => ({ resources: [mapped, ...s.resources] }));
    return mapped.id;
  },

  updateResource: async (id, r) => {
    const updates: Record<string, unknown> = {};
    if (r.name !== undefined) updates.name = r.name;
    if (r.role !== undefined) updates.role = r.role;
    if (r.monthlyCost !== undefined) updates.monthly_cost = r.monthlyCost;
    const { error } = await supabase.from('resources').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ resources: s.resources.map((x) => (x.id === id ? { ...x, ...r } : x)) }));
  },

  deleteResource: async (id) => {
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ resources: s.resources.filter((x) => x.id !== id) }));
  },

  // ---- Custody slice ----
  addCustody: async (c) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('custodies').insert({
      user_id: userId, project_id: c.projectId || null,
      company_id: c.companyId || null, resource_name: c.resourceName,
      amount: c.amount, notes: c.notes || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapCustody(data, get().expenses);
    set((s) => ({ custodies: [mapped, ...s.custodies] }));
    return mapped.id;
  },

  deleteCustody: async (id) => {
    const { error } = await supabase.from('custodies').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ custodies: s.custodies.filter((x) => x.id !== id) }));
  },

  // ---- Baseline slice ----
  createBaseline: async (projectId, name) => {
    const userId = await getUserId();
    const currentBudget = get().budgetItems.filter(b => b.projectId === projectId);
    if (currentBudget.length === 0) throw new Error('لا توجد بنود موازنة لإنشاء خط أساس');

    const existingBaselines = get().baselines.filter(b => b.projectId === projectId);
    const nextVersion = existingBaselines.length > 0
      ? Math.max(...existingBaselines.map(b => b.version)) + 1 : 1;

    const totalPlanned = currentBudget.reduce((s, b) => s + b.plannedAmount, 0);

    if (existingBaselines.length > 0) {
      await supabase.from('cost_baselines').update({ is_active: false }).eq('project_id', projectId);
    }

    const { data: bl, error: blErr } = await supabase.from('cost_baselines').insert({
      project_id: projectId, user_id: userId, name,
      version: nextVersion, is_active: true, total_planned: totalPlanned,
    }).select().single();
    if (blErr) throw blErr;

    const itemsToInsert = currentBudget.map(b => ({
      baseline_id: bl.id, category: b.category,
      description: b.description, planned_amount: b.plannedAmount,
      month: b.month || null,
      start_month: b.startMonth || null,
      end_month: b.endMonth || null,
      cost_type: b.costType || 'fixed',
    }));

    const { data: items, error: itemsErr } = await supabase
      .from('baseline_items').insert(itemsToInsert).select();
    if (itemsErr) throw itemsErr;

    const mapped: CostBaseline = {
      id: bl.id, projectId: bl.project_id, name: bl.name,
      version: bl.version, isActive: bl.is_active,
      totalPlanned: Number(bl.total_planned), createdAt: bl.created_at,
      items: (items || []).map(mapBaselineItem),
    };

    set((s) => ({
      baselines: [mapped, ...s.baselines.map(b => b.projectId === projectId ? { ...b, isActive: false } : b)],
    }));
    return mapped.id;
  },

  deleteBaseline: async (id) => {
    const bl = get().baselines.find(b => b.id === id);
    if (bl) await logDeletion('cost_baselines', id, bl, bl.projectId);
    const { error } = await supabase.from('cost_baselines').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ baselines: s.baselines.filter(b => b.id !== id) }));
  },

  setActiveBaseline: async (id, projectId) => {
    await supabase.from('cost_baselines').update({ is_active: false }).eq('project_id', projectId);
    const { error } = await supabase.from('cost_baselines').update({ is_active: true }).eq('id', id);
    if (error) throw error;
    set((s) => ({ baselines: s.baselines.map(b => b.projectId === projectId ? { ...b, isActive: b.id === id } : b) }));
  },

  loadBaselines: async (projectId) => {
    const { data: bls, error } = await supabase
      .from('cost_baselines').select('*').eq('project_id', projectId).order('version', { ascending: false });
    if (error) throw error;

    const baselines: CostBaseline[] = [];
    for (const bl of (bls || [])) {
      const { data: items } = await supabase.from('baseline_items').select('*').eq('baseline_id', bl.id);
      baselines.push({
        id: bl.id, projectId: bl.project_id, name: bl.name,
        version: bl.version, isActive: bl.is_active,
        totalPlanned: Number(bl.total_planned), createdAt: bl.created_at,
        items: (items || []).map(mapBaselineItem),
      });
    }

    set((s) => ({ baselines: [...s.baselines.filter(b => b.projectId !== projectId), ...baselines] }));
    return baselines;
  },

  // ---- Milestone slice ----
  addMilestone: async (m) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('milestones').insert({
      project_id: m.projectId, user_id: userId, name: m.name,
      description: m.description || null, sort_order: m.sortOrder || 0,
      planned_start: m.plannedStart || null, planned_end: m.plannedEnd || null,
      actual_start: m.actualStart || null, actual_end: m.actualEnd || null,
      percent_complete: m.percentComplete || 0, weight: m.weight || 0,
      status: m.status || 'planned', linked_revenue_id: m.linkedRevenueId || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapMilestone(data);
    set((s) => ({ milestones: [...s.milestones, mapped].sort((a, b) => a.sortOrder - b.sortOrder) }));
    return mapped.id;
  },

  updateMilestone: async (id, m) => {
    const updates: Record<string, unknown> = {};
    if (m.name !== undefined) updates.name = m.name;
    if (m.description !== undefined) updates.description = m.description;
    if (m.sortOrder !== undefined) updates.sort_order = m.sortOrder;
    if (m.plannedStart !== undefined) updates.planned_start = m.plannedStart;
    if (m.plannedEnd !== undefined) updates.planned_end = m.plannedEnd;
    if (m.actualStart !== undefined) updates.actual_start = m.actualStart;
    if (m.actualEnd !== undefined) updates.actual_end = m.actualEnd;
    if (m.percentComplete !== undefined) updates.percent_complete = m.percentComplete;
    if (m.weight !== undefined) updates.weight = m.weight;
    if (m.status !== undefined) updates.status = m.status;
    if (m.linkedRevenueId !== undefined) updates.linked_revenue_id = m.linkedRevenueId;
    const { error } = await (supabase as any).from('milestones').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ milestones: s.milestones.map((x) => (x.id === id ? { ...x, ...m } : x)) }));
  },

  deleteMilestone: async (id) => {
    const ms = get().milestones.find(m => m.id === id);
    if (ms) await logDeletion('milestones', id, ms, ms.projectId);
    const { error } = await (supabase as any).from('milestones').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ milestones: s.milestones.filter((x) => x.id !== id) }));
  },

  // ---- ChangeOrder slice ----
  addChangeOrder: async (co) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('change_orders').insert({
      project_id: co.projectId, user_id: userId, description: co.description,
      change_type: co.changeType || 'scope_addition',
      amount_impact: co.amountImpact || 0, duration_impact: co.durationImpact || 0,
      status: co.status || 'proposed',
      requested_by: co.requestedBy || null, approved_by: co.approvedBy || null,
      approved_date: co.approvedDate || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapChangeOrder(data);
    set((s) => ({ changeOrders: [mapped, ...s.changeOrders] }));
    return mapped.id;
  },

  updateChangeOrder: async (id, co) => {
    const updates: Record<string, unknown> = {};
    if (co.description !== undefined) updates.description = co.description;
    if (co.changeType !== undefined) updates.change_type = co.changeType;
    if (co.amountImpact !== undefined) updates.amount_impact = co.amountImpact;
    if (co.durationImpact !== undefined) updates.duration_impact = co.durationImpact;
    if (co.status !== undefined) updates.status = co.status;
    if (co.requestedBy !== undefined) updates.requested_by = co.requestedBy;
    if (co.approvedBy !== undefined) updates.approved_by = co.approvedBy;
    if (co.approvedDate !== undefined) updates.approved_date = co.approvedDate;
    const { error } = await (supabase as any).from('change_orders').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ changeOrders: s.changeOrders.map((x) => (x.id === id ? { ...x, ...co } : x)) }));
  },

  deleteChangeOrder: async (id) => {
    const co = get().changeOrders.find(c => c.id === id);
    if (co) await logDeletion('change_orders', id, co, co.projectId);
    const { error } = await (supabase as any).from('change_orders').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ changeOrders: s.changeOrders.filter((x) => x.id !== id) }));
  },

  // ---- Risk slice ----
  addRisk: async (r) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('risks').insert({
      user_id: userId,
      project_id: r.projectId || null,
      portfolio_id: r.portfolioId || null,
      title: r.title,
      description: r.description || null,
      probability: r.probability || 'medium',
      impact: r.impact || 'medium',
      financial_impact: r.financialImpact || 0,
      category: r.category || 'financial',
      status: r.status || 'open',
      mitigation_plan: r.mitigationPlan || null,
      owner: r.owner || null,
      identified_date: r.identifiedDate || null,
      closed_date: r.closedDate || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapRisk(data);
    set((s) => ({ risks: [mapped, ...s.risks] }));
    return mapped.id;
  },

  updateRisk: async (id, r) => {
    const updates: Record<string, unknown> = {};
    if (r.title !== undefined) updates.title = r.title;
    if (r.description !== undefined) updates.description = r.description;
    if (r.probability !== undefined) updates.probability = r.probability;
    if (r.impact !== undefined) updates.impact = r.impact;
    if (r.financialImpact !== undefined) updates.financial_impact = r.financialImpact;
    if (r.category !== undefined) updates.category = r.category;
    if (r.status !== undefined) updates.status = r.status;
    if (r.mitigationPlan !== undefined) updates.mitigation_plan = r.mitigationPlan;
    if (r.owner !== undefined) updates.owner = r.owner;
    if (r.identifiedDate !== undefined) updates.identified_date = r.identifiedDate;
    if (r.closedDate !== undefined) updates.closed_date = r.closedDate;
    const { error } = await (supabase as any).from('risks').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ risks: s.risks.map((x) => (x.id === id ? { ...x, ...r } : x)) }));
  },

  deleteRisk: async (id) => {
    const risk = get().risks.find(r => r.id === id);
    if (risk) await logDeletion('risks', id, risk, risk.projectId);
    const { error } = await (supabase as any).from('risks').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ risks: s.risks.filter((x) => x.id !== id) }));
  },

  // ---- IndirectCost slice ----
  addIndirectCost: async (ic) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('indirect_costs').insert({
      user_id: userId,
      company_id: ic.companyId,
      category: ic.category || 'other',
      description: ic.description,
      amount: ic.amount || 0,
      month: ic.month,
      date: ic.date,
      allocation_method: ic.allocationMethod || 'equal',
    }).select().single();
    if (error) throw error;
    const mapped = mapIndirectCost(data);
    set((s) => ({ indirectCosts: [mapped, ...s.indirectCosts] }));
    return mapped.id;
  },

  updateIndirectCost: async (id, ic) => {
    const updates: Record<string, unknown> = {};
    if (ic.category !== undefined) updates.category = ic.category;
    if (ic.description !== undefined) updates.description = ic.description;
    if (ic.amount !== undefined) updates.amount = ic.amount;
    if (ic.month !== undefined) updates.month = ic.month;
    if (ic.date !== undefined) updates.date = ic.date;
    if (ic.allocationMethod !== undefined) updates.allocation_method = ic.allocationMethod;
    const { error } = await (supabase as any).from('indirect_costs').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ indirectCosts: s.indirectCosts.map((x) => (x.id === id ? { ...x, ...ic } : x)) }));
  },

  deleteIndirectCost: async (id) => {
    const { error } = await (supabase as any).from('indirect_costs').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ indirectCosts: s.indirectCosts.filter((x) => x.id !== id) }));
  },

  // ---- Snapshot slice ----
  saveSnapshot: async (s) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('periodic_snapshots').upsert({
      user_id: userId,
      entity_type: s.entityType,
      entity_id: s.entityId,
      period: s.period,
      snapshot_date: s.snapshotDate,
      metrics: s.metrics,
    }, { onConflict: 'entity_type,entity_id,period' }).select().single();
    if (error) throw error;
    const mapped = mapSnapshot(data);
    set((st) => ({
      snapshots: [mapped, ...st.snapshots.filter(x => !(x.entityType === mapped.entityType && x.entityId === mapped.entityId && x.period === mapped.period))],
    }));
    return mapped.id;
  },

  loadSnapshots: async (entityType, entityId) => {
    const { data, error } = await (supabase as any).from('periodic_snapshots').select('*')
      .eq('entity_type', entityType).eq('entity_id', entityId)
      .order('snapshot_date', { ascending: false });
    if (error) throw error;
    const mapped = (data || []).map(mapSnapshot);
    set((s) => ({
      snapshots: [...s.snapshots.filter(x => !(x.entityType === entityType && x.entityId === entityId)), ...mapped],
    }));
    return mapped;
  },
}));
