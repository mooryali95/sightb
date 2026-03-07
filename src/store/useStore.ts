import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  Company, Portfolio, Project, BudgetItem, Expense, Revenue,
  CostBaseline, BaselineItem, Resource, Custody,
  type ExpenseCategory,
} from '@/types/project';

interface AppState {
  companies: Company[];
  portfolios: Portfolio[];
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  baselines: CostBaseline[];
  resources: Resource[];
  custodies: Custody[];
  loading: boolean;

  loadAll: () => Promise<void>;

  // Company
  addCompany: (c: Omit<Company, 'id' | 'createdAt'>) => Promise<string>;
  updateCompany: (id: string, c: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;

  // Portfolio
  addPortfolio: (p: Omit<Portfolio, 'id' | 'createdAt'>) => Promise<string>;
  updatePortfolio: (id: string, p: Partial<Portfolio>) => Promise<void>;
  deletePortfolio: (id: string) => Promise<void>;

  // Project
  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => Promise<string>;
  updateProject: (id: string, p: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Budget
  addBudgetItem: (b: Omit<BudgetItem, 'id'>) => Promise<string>;
  updateBudgetItem: (id: string, b: Partial<BudgetItem>) => Promise<void>;
  deleteBudgetItem: (id: string) => Promise<void>;

  // Expenses
  addExpense: (e: Omit<Expense, 'id'>) => Promise<string>;
  updateExpense: (id: string, e: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  // Revenue
  addRevenue: (r: Omit<Revenue, 'id'>) => Promise<string>;
  deleteRevenue: (id: string) => Promise<void>;

  // Resources
  addResource: (r: Omit<Resource, 'id' | 'createdAt'>) => Promise<string>;
  deleteResource: (id: string) => Promise<void>;

  // Custodies
  addCustody: (c: Omit<Custody, 'id' | 'createdAt' | 'spent' | 'remaining'>) => Promise<string>;
  deleteCustody: (id: string) => Promise<void>;

  // Baselines
  createBaseline: (projectId: string, name: string) => Promise<string>;
  deleteBaseline: (id: string) => Promise<void>;
  setActiveBaseline: (id: string, projectId: string) => Promise<void>;
  loadBaselines: (projectId: string) => Promise<CostBaseline[]>;
}

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export const useStore = create<AppState>()((set, get) => ({
  companies: [],
  portfolios: [],
  projects: [],
  budgetItems: [],
  expenses: [],
  revenues: [],
  baselines: [],
  resources: [],
  custodies: [],
  loading: true,

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
      custodies: (custodies.data || []).map((c: any) => mapCustody(c, expenseList)),
      loading: false,
    });
  },

  addCompany: async (c) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('companies').insert({
      user_id: userId,
      name: c.name,
      description: c.description || null,
      logo: c.logo || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapCompany(data);
    set((s) => ({ companies: [mapped, ...s.companies] }));
    return mapped.id;
  },

  updateCompany: async (id, c) => {
    const updates: any = {};
    if (c.name !== undefined) updates.name = c.name;
    if (c.description !== undefined) updates.description = c.description;
    if (c.logo !== undefined) updates.logo = c.logo;
    const { error } = await supabase.from('companies').update(updates).eq('id', id);
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

  addPortfolio: async (p) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('portfolios').insert({
      user_id: userId,
      company_id: p.companyId,
      name: p.name,
      description: p.description || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapPortfolio(data);
    set((s) => ({ portfolios: [mapped, ...s.portfolios] }));
    return mapped.id;
  },

  updatePortfolio: async (id, p) => {
    const updates: any = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.description !== undefined) updates.description = p.description;
    if (p.companyId !== undefined) updates.company_id = p.companyId;
    const { error } = await supabase.from('portfolios').update(updates).eq('id', id);
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

  addProject: async (p) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('projects').insert({
      user_id: userId,
      company_id: p.companyId,
      portfolio_id: p.portfolioId === 'none' ? null : (p.portfolioId || null),
      name: p.name,
      description: p.description || null,
      contract_value: p.contractValue,
      currency: p.currency,
      start_date: p.startDate || null,
      end_date: p.endDate || null,
      duration_months: p.durationMonths,
      resource_count: p.resourceCount,
      status: p.status,
      client_logo: p.clientLogo || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapProject(data);
    set((s) => ({ projects: [mapped, ...s.projects] }));
    return mapped.id;
  },

  updateProject: async (id, p) => {
    const updates: any = {};
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
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({
      projects: s.projects.filter((x) => x.id !== id),
      budgetItems: s.budgetItems.filter((x) => x.projectId !== id),
      expenses: s.expenses.filter((x) => x.projectId !== id),
      revenues: s.revenues.filter((x) => x.projectId !== id),
    }));
  },

  addBudgetItem: async (b) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('budget_items').insert({
      user_id: userId,
      project_id: b.projectId,
      category: b.category,
      description: b.description,
      planned_amount: b.plannedAmount,
      month: b.month || null,
      resource_id: b.resourceId || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapBudgetItem(data);
    set((s) => ({ budgetItems: [mapped, ...s.budgetItems] }));
    return mapped.id;
  },

  updateBudgetItem: async (id, b) => {
    const updates: any = {};
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
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ budgetItems: s.budgetItems.filter((x) => x.id !== id) }));
  },

  addExpense: async (e) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('expenses').insert({
      user_id: userId,
      project_id: e.projectId,
      budget_item_id: e.budgetItemId || null,
      category: e.category,
      description: e.description,
      amount: e.amount,
      date: e.date,
      month: e.month,
      responsible: e.responsible || null,
      notes: e.notes || null,
      resource_id: e.resourceId || null,
      custody_id: e.custodyId || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapExpense(data);
    set((s) => ({ expenses: [mapped, ...s.expenses] }));
    return mapped.id;
  },

  updateExpense: async (id, e) => {
    const updates: any = {};
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
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
  },

  addRevenue: async (r) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('revenues').insert({
      user_id: userId,
      project_id: r.projectId,
      description: r.description,
      amount: r.amount,
      date: r.date,
      month: r.month,
    }).select().single();
    if (error) throw error;
    const mapped = mapRevenue(data);
    set((s) => ({ revenues: [mapped, ...s.revenues] }));
    return mapped.id;
  },

  deleteRevenue: async (id) => {
    const { error } = await supabase.from('revenues').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ revenues: s.revenues.filter((x) => x.id !== id) }));
  },

  // Resources
  addResource: async (r) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('resources').insert({
      user_id: userId,
      project_id: r.projectId,
      name: r.name,
      role: r.role || null,
      monthly_cost: r.monthlyCost,
    }).select().single();
    if (error) throw error;
    const mapped = mapResource(data);
    set((s) => ({ resources: [mapped, ...s.resources] }));
    return mapped.id;
  },

  deleteResource: async (id) => {
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ resources: s.resources.filter((x) => x.id !== id) }));
  },

  // Custodies
  addCustody: async (c) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('custodies').insert({
      user_id: userId,
      project_id: c.projectId || null,
      company_id: c.companyId || null,
      resource_name: c.resourceName,
      amount: c.amount,
      notes: c.notes || null,
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

  createBaseline: async (projectId, name) => {
    const userId = await getUserId();
    // Get current budget items for this project
    const currentBudget = get().budgetItems.filter(b => b.projectId === projectId);
    if (currentBudget.length === 0) throw new Error('لا توجد بنود موازنة لإنشاء خط أساس');

    // Get next version number
    const existingBaselines = get().baselines.filter(b => b.projectId === projectId);
    const nextVersion = existingBaselines.length > 0
      ? Math.max(...existingBaselines.map(b => b.version)) + 1
      : 1;

    const totalPlanned = currentBudget.reduce((s, b) => s + b.plannedAmount, 0);

    // Deactivate existing baselines
    if (existingBaselines.length > 0) {
      await supabase.from('cost_baselines')
        .update({ is_active: false })
        .eq('project_id', projectId);
    }

    // Create baseline
    const { data: bl, error: blErr } = await supabase.from('cost_baselines').insert({
      project_id: projectId,
      user_id: userId,
      name,
      version: nextVersion,
      is_active: true,
      total_planned: totalPlanned,
    }).select().single();
    if (blErr) throw blErr;

    // Create baseline items (snapshot of current budget)
    const itemsToInsert = currentBudget.map(b => ({
      baseline_id: bl.id,
      category: b.category,
      description: b.description,
      planned_amount: b.plannedAmount,
      month: b.month || null,
    }));

    const { data: items, error: itemsErr } = await supabase
      .from('baseline_items')
      .insert(itemsToInsert)
      .select();
    if (itemsErr) throw itemsErr;

    const mapped: CostBaseline = {
      id: bl.id,
      projectId: bl.project_id,
      name: bl.name,
      version: bl.version,
      isActive: bl.is_active,
      totalPlanned: Number(bl.total_planned),
      createdAt: bl.created_at,
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
    const { error } = await supabase.from('cost_baselines').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ baselines: s.baselines.filter(b => b.id !== id) }));
  },

  setActiveBaseline: async (id, projectId) => {
    // Deactivate all for project
    await supabase.from('cost_baselines')
      .update({ is_active: false })
      .eq('project_id', projectId);
    // Activate selected
    const { error } = await supabase.from('cost_baselines')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw error;
    set((s) => ({
      baselines: s.baselines.map(b =>
        b.projectId === projectId
          ? { ...b, isActive: b.id === id }
          : b
      ),
    }));
  },

  loadBaselines: async (projectId) => {
    const { data: bls, error } = await supabase
      .from('cost_baselines')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false });
    if (error) throw error;

    const baselines: CostBaseline[] = [];
    for (const bl of (bls || [])) {
      const { data: items } = await supabase
        .from('baseline_items')
        .select('*')
        .eq('baseline_id', bl.id);
      baselines.push({
        id: bl.id,
        projectId: bl.project_id,
        name: bl.name,
        version: bl.version,
        isActive: bl.is_active,
        totalPlanned: Number(bl.total_planned),
        createdAt: bl.created_at,
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

// Mappers from DB snake_case to app camelCase
function mapCompany(d: any): Company {
  return { id: d.id, name: d.name, description: d.description || undefined, logo: d.logo || undefined, createdAt: d.created_at };
}

function mapPortfolio(d: any): Portfolio {
  return { id: d.id, companyId: d.company_id, name: d.name, description: d.description || undefined, createdAt: d.created_at };
}

function mapProject(d: any): Project {
  return {
    id: d.id, companyId: d.company_id, portfolioId: d.portfolio_id || undefined,
    name: d.name, description: d.description || undefined,
    contractValue: Number(d.contract_value), currency: d.currency,
    startDate: d.start_date || '', endDate: d.end_date || '',
    durationMonths: d.duration_months, resourceCount: d.resource_count,
    status: d.status, clientLogo: d.client_logo || undefined, createdAt: d.created_at,
  };
}

function mapBudgetItem(d: any): BudgetItem {
  return { id: d.id, projectId: d.project_id, category: d.category, description: d.description, plannedAmount: Number(d.planned_amount), month: d.month || undefined };
}

function mapExpense(d: any): Expense {
  return {
    id: d.id, projectId: d.project_id, budgetItemId: d.budget_item_id || undefined,
    category: d.category, description: d.description, amount: Number(d.amount),
    date: d.date, month: d.month, responsible: d.responsible || undefined, notes: d.notes || undefined,
  };
}

function mapRevenue(d: any): Revenue {
  return { id: d.id, projectId: d.project_id, description: d.description, amount: Number(d.amount), date: d.date, month: d.month };
}

function mapBaselineItem(d: any): BaselineItem {
  return {
    id: d.id,
    baselineId: d.baseline_id,
    category: d.category,
    description: d.description,
    plannedAmount: Number(d.planned_amount),
    month: d.month || undefined,
  };
}
