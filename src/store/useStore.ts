import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  Company, Portfolio, Project, BudgetItem, Expense, Revenue,
  CostBaseline, Resource, Custody,
} from '@/types/project';
import {
  getUserId, logDeletion,
  mapCompany, mapPortfolio, mapProject, mapBudgetItem,
  mapExpense, mapResource, mapCustody, mapRevenue, mapBaselineItem,
} from './helpers';

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  tableName: string;
  recordId: string;
  recordData: any;
  projectId?: string;
  createdAt: string;
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

type AppState = DataState & LoadActions & CompanyActions & PortfolioActions & ProjectActions &
  BudgetActions & ExpenseActions & RevenueActions & ResourceActions & CustodyActions & BaselineActions;

export const useStore = create<AppState>()((set, get) => ({
  // ---- Initial state ----
  companies: [],
  portfolios: [],
  projects: [],
  budgetItems: [],
  expenses: [],
  revenues: [],
  baselines: [],
  resources: [],
  custodies: [],
  auditLog: [],
  loading: true,

  // ---- Load slice ----
  loadAll: async () => {
    set({ loading: true });
    const [companies, portfolios, projects, budgetItems, expenses, revenues, resources, custodies] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('portfolios').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('budget_items').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('revenues').select('*').order('created_at', { ascending: false }),
      supabase.from('resources').select('*').order('created_at', { ascending: false }),
      supabase.from('custodies').select('*').order('created_at', { ascending: false }),
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
    const { data, error } = await supabase.from('companies').insert({
      user_id: userId, name: c.name, description: c.description || null, logo: c.logo || null,
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
    const { error } = await supabase.from('companies').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, ...c } : x)) }));
  },

  deleteCompany: async (id) => {
    const company = get().companies.find(x => x.id === id);
    if (company) await logDeletion('companies', id, company);
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({
      companies: s.companies.filter((x) => x.id !== id),
      portfolios: s.portfolios.filter((x) => x.companyId !== id),
      projects: s.projects.filter((x) => x.companyId !== id),
    }));
  },

  // ---- Portfolio slice ----
  addPortfolio: async (p) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('portfolios').insert({
      user_id: userId, company_id: p.companyId, name: p.name, description: p.description || null,
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
    const { error } = await supabase.from('portfolios').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ portfolios: s.portfolios.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  },

  deletePortfolio: async (id) => {
    const portfolio = get().portfolios.find(x => x.id === id);
    if (portfolio) await logDeletion('portfolios', id, portfolio);
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
    }).select().single();
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
    const { error } = await supabase.from('projects').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  },

  deleteProject: async (id) => {
    const project = get().projects.find(x => x.id === id);
    if (project) await logDeletion('projects', id, project);
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
    const { data, error } = await supabase.from('budget_items').insert({
      user_id: userId, project_id: b.projectId, category: b.category,
      description: b.description, planned_amount: b.plannedAmount,
      month: b.month || null, resource_id: b.resourceId || null,
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
    if (b.resourceId !== undefined) updates.resource_id = b.resourceId;
    const { error } = await supabase.from('budget_items').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ budgetItems: s.budgetItems.map((x) => (x.id === id ? { ...x, ...b } : x)) }));
  },

  deleteBudgetItem: async (id) => {
    const item = get().budgetItems.find(x => x.id === id);
    if (item) await logDeletion('budget_items', id, item, item.projectId);
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
    const { error } = await supabase.from('expenses').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.map((x) => (x.id === id ? { ...x, ...e } : x)) }));
  },

  deleteExpense: async (id) => {
    const expense = get().expenses.find(x => x.id === id);
    if (expense) await logDeletion('expenses', id, expense, expense.projectId);
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
  },

  // ---- Revenue slice ----
  addRevenue: async (r) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('revenues').insert({
      user_id: userId, project_id: r.projectId,
      description: r.description, amount: r.amount, date: r.date, month: r.month,
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
    const { error } = await supabase.from('revenues').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ revenues: s.revenues.map((x) => (x.id === id ? { ...x, ...r } : x)) }));
  },

  deleteRevenue: async (id) => {
    const rev = get().revenues.find(x => x.id === id);
    if (rev) await logDeletion('revenues', id, rev, rev.projectId);
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

  deleteResource: async (id) => {
    const res = get().resources.find(x => x.id === id);
    if (res) await logDeletion('resources', id, res, res.projectId);
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
    const cust = get().custodies.find(x => x.id === id);
    if (cust) await logDeletion('custodies', id, cust, cust.projectId);
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
      ? Math.max(...existingBaselines.map(b => b.version)) + 1
      : 1;

    const totalPlanned = currentBudget.reduce((s, b) => s + b.plannedAmount, 0);

    if (existingBaselines.length > 0) {
      await supabase.from('cost_baselines')
        .update({ is_active: false })
        .eq('project_id', projectId);
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
      baselines: [
        mapped,
        ...s.baselines.map(b => b.projectId === projectId ? { ...b, isActive: false } : b),
      ],
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
    await supabase.from('cost_baselines')
      .update({ is_active: false })
      .eq('project_id', projectId);
    const { error } = await supabase.from('cost_baselines')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw error;
    set((s) => ({
      baselines: s.baselines.map(b =>
        b.projectId === projectId ? { ...b, isActive: b.id === id } : b
      ),
    }));
  },

  loadBaselines: async (projectId) => {
    const { data: bls, error } = await supabase
      .from('cost_baselines').select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false });
    if (error) throw error;

    const baselines: CostBaseline[] = [];
    for (const bl of (bls || [])) {
      const { data: items } = await supabase
        .from('baseline_items').select('*')
        .eq('baseline_id', bl.id);
      baselines.push({
        id: bl.id, projectId: bl.project_id, name: bl.name,
        version: bl.version, isActive: bl.is_active,
        totalPlanned: Number(bl.total_planned), createdAt: bl.created_at,
        items: (items || []).map(mapBaselineItem),
      });
    }

    set((s) => ({
      baselines: [
        ...s.baselines.filter(b => b.projectId !== projectId),
        ...baselines,
      ],
    }));
    return baselines;
  },
}));
