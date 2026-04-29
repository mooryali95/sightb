import { StateCreator } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { Portfolio, Project } from '@/types/project';
import { getUserId, logDeletion, mapPortfolio, mapProject } from '../helpers';
import type { AppState } from '../useStore';

export interface ProjectSlice {
  portfolios: Portfolio[];
  projects: Project[];
  addPortfolio: (p: Omit<Portfolio, 'id' | 'createdAt'>) => Promise<string>;
  updatePortfolio: (id: string, p: Partial<Portfolio>) => Promise<void>;
  deletePortfolio: (id: string) => Promise<void>;
  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => Promise<string>;
  updateProject: (id: string, p: Partial<Project>) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  unarchiveProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => ({
  portfolios: [],
  projects: [],

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
      tax_percent: p.taxPercent ?? 15,
      vat_inclusive: p.vatInclusive ?? false,
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
    if (p.taxPercent !== undefined) updates.tax_percent = p.taxPercent;
    if (p.vatInclusive !== undefined) updates.vat_inclusive = p.vatInclusive;
    const { error } = await (supabase as any).from('projects').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  },

  archiveProject: async (id) => {
    const { error } = await (supabase as any).from('projects').update({ status: 'archived' }).eq('id', id);
    if (error) throw error;
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, status: 'archived' as const } : x)) }));
  },

  unarchiveProject: async (id) => {
    const { error } = await (supabase as any).from('projects').update({ status: 'active' }).eq('id', id);
    if (error) throw error;
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, status: 'active' as const } : x)) }));
  },

  deleteProject: async (id) => {
    // Safety: project must be archived first (also enforced by DB trigger)
    const project = get().projects.find((x) => x.id === id);
    if (project && project.status !== 'archived') {
      throw new Error('يجب أرشفة المشروع قبل حذفه نهائياً');
    }
    const tables = ['risks', 'change_orders', 'milestones', 'revenues', 'expenses', 'budget_items', 'resources', 'custodies', 'commitments'] as const;
    for (const table of tables) {
      await (supabase as any).from(table).delete().eq('project_id', id);
    }
    await supabase.from('cost_baselines').delete().eq('project_id', id);
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({
      projects: s.projects.filter((x) => x.id !== id),
      budgetItems: s.budgetItems.filter((x) => x.projectId !== id),
      expenses: s.expenses.filter((x) => x.projectId !== id),
      revenues: s.revenues.filter((x) => x.projectId !== id),
      milestones: s.milestones.filter((x) => x.projectId !== id),
      changeOrders: s.changeOrders.filter((x) => x.projectId !== id),
      risks: s.risks.filter((x) => x.projectId !== id),
      resources: s.resources.filter((x) => x.projectId !== id),
      custodies: s.custodies.filter((x) => x.projectId !== id),
      projectFunds: s.projectFunds.filter((x) => x.projectId !== id),
      fundSettlements: s.fundSettlements.filter((x) => x.projectId !== id),
    }));
  },
});
