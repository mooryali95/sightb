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
  subscribeToProject: (projectId: string) => () => void;
}

/**
 * Paginated fetch to overcome Supabase's 1000-row default limit.
 */
async function fetchAll(
  table: string,
  orderCol = 'created_at',
  ascending = false,
  filters?: Record<string, string>,
): Promise<any[]> {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    let q = (supabase as any).from(table).select('*')
      .order(orderCol, { ascending })
      .range(from, from + PAGE - 1);
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
    }
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
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
        const [budgetItemsData, expensesData, revenuesData, resourcesData, custodiesData, milestonesData, changeOrdersData, risksData, indirectCostsData, commitmentsData] = await Promise.all([
          fetchAll('budget_items'),
          fetchAll('expenses'),
          fetchAll('revenues'),
          fetchAll('resources'),
          fetchAll('custodies'),
          fetchAll('milestones', 'sort_order', true),
          fetchAll('change_orders'),
          fetchAll('risks'),
          fetchAll('indirect_costs'),
          fetchAll('commitments'),
        ]);

        const mappedExpenses = expensesData.map(mapExpense);

        set({
          budgetItems: budgetItemsData.map(mapBudgetItem),
          expenses: mappedExpenses,
          revenues: revenuesData.map(mapRevenue),
          resources: resourcesData.map(mapResource),
          custodies: custodiesData.map((c: any) => mapCustody(c, mappedExpenses)),
          milestones: milestonesData.map(mapMilestone),
          changeOrders: changeOrdersData.map(mapChangeOrder),
          risks: risksData.map(mapRisk),
          indirectCosts: indirectCostsData.map(mapIndirectCost),
          commitments: commitmentsData.map(mapCommitment),
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
      const [budgetItemsData, expensesData, revenuesData, resourcesData, custodiesData, milestonesData, changeOrdersData, risksData] = await Promise.all([
        fetchAll('budget_items', 'created_at', false, { project_id: projectId }),
        fetchAll('expenses', 'created_at', false, { project_id: projectId }),
        fetchAll('revenues', 'created_at', false, { project_id: projectId }),
        fetchAll('resources', 'created_at', false, { project_id: projectId }),
        fetchAll('custodies', 'created_at', false, { project_id: projectId }),
        fetchAll('milestones', 'sort_order', true, { project_id: projectId }),
        fetchAll('change_orders', 'created_at', false, { project_id: projectId }),
        fetchAll('risks', 'created_at', false, { project_id: projectId }),
      ]);

      const mappedExpenses = expensesData.map(mapExpense);
      const loaded = new Set(get().projectDataLoaded);
      loaded.add(projectId);

      set((s) => ({
        budgetItems: [...s.budgetItems.filter(b => b.projectId !== projectId), ...budgetItemsData.map(mapBudgetItem)],
        expenses: [...s.expenses.filter(e => e.projectId !== projectId), ...mappedExpenses],
        revenues: [...s.revenues.filter(r => r.projectId !== projectId), ...revenuesData.map(mapRevenue)],
        resources: [...s.resources.filter(r => r.projectId !== projectId), ...resourcesData.map(mapResource)],
        custodies: [...s.custodies.filter(c => c.projectId !== projectId), ...custodiesData.map((c: any) => mapCustody(c, mappedExpenses))],
        milestones: [...s.milestones.filter(m => m.projectId !== projectId), ...milestonesData.map(mapMilestone)],
        changeOrders: [...s.changeOrders.filter(co => co.projectId !== projectId), ...changeOrdersData.map(mapChangeOrder)],
        risks: [...s.risks.filter(r => r.projectId !== projectId), ...risksData.map(mapRisk)],
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

  subscribeToProject: (projectId: string) => {
    const tables = ['expenses', 'revenues', 'milestones', 'budget_items', 'change_orders'] as const;
    const mappers: Record<string, { key: string; map: (d: any) => any }> = {
      expenses: { key: 'expenses', map: mapExpense },
      revenues: { key: 'revenues', map: mapRevenue },
      milestones: { key: 'milestones', map: mapMilestone },
      budget_items: { key: 'budgetItems', map: mapBudgetItem },
      change_orders: { key: 'changeOrders', map: mapChangeOrder },
    };

    const channel = supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        const table = payload.table;
        const m = mappers[table];
        if (!m) return;

        if (payload.eventType === 'INSERT') {
          set((s: any) => ({ [m.key]: [m.map(payload.new), ...s[m.key]] }));
        } else if (payload.eventType === 'UPDATE') {
          set((s: any) => ({
            [m.key]: s[m.key].map((item: any) =>
              item.id === (payload.new as any).id ? m.map(payload.new) : item
            ),
          }));
        } else if (payload.eventType === 'DELETE') {
          set((s: any) => ({
            [m.key]: s[m.key].filter((item: any) => item.id !== (payload.old as any).id),
          }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
});
