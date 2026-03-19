import { StateCreator } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  CostBaseline,
} from '@/types/project';
import {
  mapCompany, mapPortfolio, mapProject, mapBudgetItem,
  mapExpense, mapResource, mapCustody, mapRevenue, mapBaselineItem,
  mapMilestone, mapChangeOrder, mapRisk, mapIndirectCost, mapSnapshot,
  mapCommitment,
} from '../helpers';
import type { AppState, AuditLogEntry } from '../useStore';

export interface LoadSlice {
  loading: boolean;
  detailsLoading: boolean;
  detailsLoaded: boolean;
  projectDataLoaded: Set<string>;
  auditLog: AuditLogEntry[];
  loadAll: () => Promise<void>;
  loadProjectData: (projectId: string) => Promise<void>;
  loadCompanyData: (companyId: string) => Promise<void>;
  loadAuditLog: (projectId: string) => Promise<void>;
}

export const createLoadSlice: StateCreator<AppState, [], [], LoadSlice> = (set, get) => ({
  loading: true,
  detailsLoading: false,
  detailsLoaded: false,
  projectDataLoaded: new Set<string>(),
  auditLog: [],

  loadAll: async () => {
    const now = Date.now();
    const lastLoaded = (get() as any)._lastLoadedAt || 0;
    if (now - lastLoaded < 30000 && get().companies.length > 0) return;

    try {
      set({ loading: true });
      const [companies, portfolios, projects] = await Promise.all([
        supabase.from('companies').select('*').order('created_at', { ascending: false }),
        supabase.from('portfolios').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
      ]);

      if (companies.error) throw companies.error;
      if (portfolios.error) throw portfolios.error;
      if (projects.error) throw projects.error;

      set({
        companies: (companies.data || []).map(mapCompany),
        portfolios: (portfolios.data || []).map(mapPortfolio),
        projects: (projects.data || []).map(mapProject),
        loading: false,
        _lastLoadedAt: now,
      } as any);

      if (!get().detailsLoaded) {
        set({ detailsLoading: true });
        const [budgetItems, expenses, revenues, resources, custodies, milestones, changeOrders, risks, indirectCosts, commitments] = await Promise.all([
          supabase.from('budget_items').select('*').order('created_at', { ascending: false }),
          supabase.from('expenses').select('*').order('created_at', { ascending: false }),
          supabase.from('revenues').select('*').order('created_at', { ascending: false }),
          supabase.from('resources').select('*').order('created_at', { ascending: false }),
          supabase.from('custodies').select('*').order('created_at', { ascending: false }),
          supabase.from('milestones').select('*').order('sort_order', { ascending: true }),
          supabase.from('change_orders').select('*').order('created_at', { ascending: false }),
          supabase.from('risks').select('*').order('created_at', { ascending: false }),
          supabase.from('indirect_costs').select('*').order('created_at', { ascending: false }),
          (supabase as any).from('commitments').select('*').order('created_at', { ascending: false }),
        ]);

        const tables = { budgetItems, expenses, revenues, resources, custodies, milestones, changeOrders, risks, indirectCosts };
        for (const [name, result] of Object.entries(tables)) {
          if (result.data && result.data.length >= 1000) {
            console.warn(`[Store] جدول ${name} وصل للحد الأقصى (1000 صف). قد تكون هناك بيانات مفقودة.`);
          }
        }

        const mappedExpenses = (expenses.data || []).map(mapExpense);

        set({
          budgetItems: (budgetItems.data || []).map(mapBudgetItem),
          expenses: mappedExpenses,
          revenues: (revenues.data || []).map(mapRevenue),
          resources: (resources.data || []).map(mapResource),
          custodies: (custodies.data || []).map((c) => mapCustody(c, mappedExpenses)),
          milestones: (milestones.data || []).map(mapMilestone),
          changeOrders: (changeOrders.data || []).map(mapChangeOrder),
          risks: (risks.data || []).map(mapRisk),
          indirectCosts: (indirectCosts.data || []).map(mapIndirectCost),
          commitments: (commitments.data || []).map(mapCommitment),
          detailsLoading: false,
          detailsLoaded: true,
        });
      }
    } catch (error: any) {
      console.error('[Store.loadAll]', error);
      set({ loading: false, detailsLoading: false });
      throw error;
    }
  },

  loadProjectData: async (projectId: string) => {
    if (get().detailsLoaded || get().projectDataLoaded.has(projectId)) return;

    try {
      const [budgetItems, expenses, revenues, resources, custodies, milestones, changeOrders, risks] = await Promise.all([
        supabase.from('budget_items').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('expenses').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('revenues').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('resources').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('custodies').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('milestones').select('*').eq('project_id', projectId).order('sort_order', { ascending: true }),
        supabase.from('change_orders').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('risks').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      ]);

      const mappedExpenses = (expenses.data || []).map(mapExpense);
      const loaded = new Set(get().projectDataLoaded);
      loaded.add(projectId);

      set((s) => ({
        budgetItems: [...s.budgetItems.filter(b => b.projectId !== projectId), ...(budgetItems.data || []).map(mapBudgetItem)],
        expenses: [...s.expenses.filter(e => e.projectId !== projectId), ...mappedExpenses],
        revenues: [...s.revenues.filter(r => r.projectId !== projectId), ...(revenues.data || []).map(mapRevenue)],
        resources: [...s.resources.filter(r => r.projectId !== projectId), ...(resources.data || []).map(mapResource)],
        custodies: [...s.custodies.filter(c => c.projectId !== projectId), ...(custodies.data || []).map(c => mapCustody(c, mappedExpenses))],
        milestones: [...s.milestones.filter(m => m.projectId !== projectId), ...(milestones.data || []).map(mapMilestone)],
        changeOrders: [...s.changeOrders.filter(co => co.projectId !== projectId), ...(changeOrders.data || []).map(mapChangeOrder)],
        risks: [...s.risks.filter(r => r.projectId !== projectId), ...(risks.data || []).map(mapRisk)],
        projectDataLoaded: loaded,
      }));
    } catch (error: any) {
      console.error('[Store.loadProjectData]', error);
      throw error;
    }
  },

  loadCompanyData: async (companyId: string) => {
    if (get().detailsLoaded) return;
    try {
      const companyProjects = get().projects.filter(p => p.companyId === companyId);
      const [indirectCosts] = await Promise.all([
        supabase.from('indirect_costs').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);
      set((s) => ({
        indirectCosts: [...s.indirectCosts.filter(ic => ic.companyId !== companyId), ...(indirectCosts.data || []).map(mapIndirectCost)],
      }));
      for (const p of companyProjects) {
        await get().loadProjectData(p.id);
      }
    } catch (error: any) {
      console.error('[Store.loadCompanyData]', error);
      throw error;
    }
  },

  loadAuditLog: async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('audit_log').select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      set({
        auditLog: (data || []).map((d) => ({
          id: d.id, userId: d.user_id, action: d.action,
          tableName: d.table_name, recordId: d.record_id,
          recordData: d.record_data, projectId: d.project_id || undefined,
          createdAt: d.created_at,
        })),
      });
    } catch (error: any) {
      console.error('[Store.loadAuditLog]', error);
      throw error;
    }
  },
});
