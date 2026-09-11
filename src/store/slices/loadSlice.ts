import { StateCreator } from 'zustand';
import { db } from '@/services/db';
import type { Database, Tables } from '@/integrations/supabase/types';

/** Every table name the generated schema knows about. */
type TableName = keyof Database['public']['Tables'];
import {
  CostBaseline,
} from '@/types/project';
import {
  mapCompany, mapPortfolio, mapProject, mapBudgetItem,
  mapExpense, mapResource, mapCustody, mapRevenue, mapBaselineItem,
  mapMilestone, mapChangeOrder, mapRisk, mapIndirectCost, mapSnapshot,
  mapCommitment,
} from '../helpers';
import { applyCashTransferRealtimeEvent, type CashTransferRealtimePayload } from './cashTransferSlice';
import type { AppState, AuditLogEntry } from '../useStore';

export interface LoadSlice {
  loading: boolean;
  detailsLoading: boolean;
  detailsLoaded: boolean;
  projectDataLoaded: Set<string>;
  auditLog: AuditLogEntry[];
  /** When loadAll last completed, so repeat calls inside 30s can no-op. */
  _lastLoadedAt?: number;
  loadAll: () => Promise<void>;
  loadDetails: () => Promise<void>;

  ensureProjectCashData: (projectId: string) => Promise<void>;
  /** طبقة واحدة لإعادة جلب النقد + إعادة اشتقاق الأرصدة (العهد) بعد أي إصلاح. */
  refreshCashDerivations: (projectId: string) => Promise<void>;
  loadProjectData: (projectId: string) => Promise<void>;
  loadCompanyData: (companyId: string) => Promise<void>;
  loadAuditLog: (projectId: string) => Promise<void>;
  subscribeToProject: (projectId: string) => () => void;
}

/** Raw `audit_log` row as it comes back from PostgREST (snake_case). */
interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  table_name: string;
  record_id: string;
  record_data: unknown;
  project_id: string | null;
  created_at: string;
}

/**
 * Paginated fetch to overcome Supabase's 1000-row default limit.
 */
async function fetchAll<T extends TableName>(
  table: T,
  orderCol = 'created_at',
  ascending = false,
  filters?: Record<string, string>,
): Promise<Tables<T>[]> {
  const PAGE = 1000;
  let from = 0;
  const all: Tables<T>[] = [];
  while (true) {
    let q = db.from(table).select('*')
      .order(orderCol, { ascending })
      .range(from, from + PAGE - 1);
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
    }
    const { data, error } = await q;
    if (error) throw error;
    // The one cast in this function, and it is confined here: db.from records
    // its chain lazily and so cannot carry the row type through. The table
    // name is what the generic pins, so callers still get real rows.
    all.push(...((data ?? []) as Tables<T>[]));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/**
 * Pure reducer for a realtime row event on one of the project-scoped tables.
 *
 * Exported so it can be tested directly, the same way
 * `applyCashTransferRealtimeEvent` is: the logic used to live inside the
 * subscription callback, where nothing could reach it.
 */
export interface ProjectRealtimePayload {
  eventType: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export function applyProjectRealtimeEvent<T extends { id: string }>(
  list: T[],
  payload: ProjectRealtimePayload,
  map: (d: never) => T,
): T[] {
  if (payload.eventType === 'INSERT' && payload.new) {
    const mapped = map(payload.new as never);
    // A client that just wrote this row receives its own INSERT back over
    // realtime, and every caller here has already added the row optimistically.
    // Without this the same expense sits in state twice, and every figure
    // derived from the list — custody spend, fund remaining, dashboard totals,
    // variance — counts it twice until the page is reloaded.
    //
    // `applyCashTransferRealtimeEvent` has carried this guard for its own table
    // all along; the generic path beside it did not.
    if (list.some((item) => item.id === mapped.id)) return list;
    return [mapped, ...list];
  }
  if (payload.eventType === 'UPDATE' && payload.new) {
    const mapped = map(payload.new as never);
    return list.map((item) => (item.id === mapped.id ? mapped : item));
  }
  if (payload.eventType === 'DELETE' && payload.old?.id) {
    const deletedId = payload.old.id;
    return list.filter((item) => item.id !== deletedId);
  }
  return list;
}

export const createLoadSlice: StateCreator<AppState, [], [], LoadSlice> = (set, get) => ({
  loading: true,
  detailsLoading: false,
  detailsLoaded: false,
  projectDataLoaded: new Set<string>(),
  auditLog: [],

  loadAll: async () => {
    const now = Date.now();
    const lastLoaded = get()._lastLoadedAt ?? 0;
    if (now - lastLoaded < 30000 && get().companies.length > 0) return;

    try {
      set({ loading: true });
      const [companies, portfolios, projects] = await Promise.all([
        db.from('companies').select('*').order('created_at', { ascending: false }),
        db.from('portfolios').select('*').order('created_at', { ascending: false }),
        db.from('projects').select('*').order('created_at', { ascending: false }),
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
      });
    } catch (error) {
      console.error('[Store.loadAll]', error);
      set({ loading: false });
      throw error;
    }
  },

  /**
   * Cross-project preload. Only screens that aggregate over every project
   * (the portfolio dashboard) need it — routes like project detail load
   * their own slice of data instead.
   */
  loadDetails: async () => {
    if (get().detailsLoaded || get().detailsLoading) return;
    try {
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
        custodies: custodiesData.map((c) => mapCustody(c, mappedExpenses)),
        milestones: milestonesData.map(mapMilestone),
        changeOrders: changeOrdersData.map(mapChangeOrder),
        risks: risksData.map(mapRisk),
        indirectCosts: indirectCostsData.map(mapIndirectCost),
        commitments: commitmentsData.map(mapCommitment),
        detailsLoading: false,
        detailsLoaded: true,
      });
    } catch (error) {
      console.error('[Store.loadDetails]', error);
      set({ detailsLoading: false });
      throw error;
    }
  },


  /**
   * النقد (دفعات + مستحقات + تحويلات نقدية) ليس جزءاً من `loadDetails()`،
   * لذلك يجب تحميله لكل مشروع دائماً — بغض النظر عن حالة `detailsLoaded`.
   * إغفال هذا كان يسبب أرصدة وهمية (تحويلات صادرة غير محمّلة).
   */
  ensureProjectCashData: async (projectId: string) => {
    const tasks: Array<Promise<unknown>> = [
      Promise.resolve(get().loadFundsForProject(projectId)).catch((err) => {
        console.warn('[Store.loadFundsForProject]', err);
      }),
      Promise.resolve(get().loadResourcePayablesForProject(projectId)).catch((err) => {
        console.warn('[Store.loadResourcePayablesForProject]', err);
      }),
      Promise.resolve(get().loadCashTransfersForProject(projectId)).catch((err) => {
        console.warn('[Store.loadCashTransfersForProject]', err);
      }),
    ];
    await Promise.all(tasks);
  },

  /**
   * طبقة موحّدة: تُستدعى بعد أي عملية تغيّر النقد (إصلاح/تحويل/تسوية)
   * فتعيد جلب الدفعات والتحويلات والمستحقات ثم تعيد اشتقاق العهد،
   * ما يضمن اتساق FundsSection وProjectDetail من مصدر واحد.
   */
  refreshCashDerivations: async (projectId: string) => {
    await get().ensureProjectCashData(projectId);
    try {
      const custodiesData = await fetchAll('custodies', 'created_at', false, { project_id: projectId });
      set((s) => {
        const projectExpenses = s.expenses.filter((e) => e.projectId === projectId);
        return {
          custodies: [
            ...s.custodies.filter((c) => c.projectId !== projectId),
            ...custodiesData.map((c) => mapCustody(c, projectExpenses)),
          ],
        };
      });
    } catch (err) {
      console.warn('[Store.refreshCashDerivations]', err);
    }
  },

  loadProjectData: async (projectId: string) => {
    // بيانات النقد تُحمّل دائماً (SSOT للأرصدة)
    await get().ensureProjectCashData(projectId);

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
        custodies: [...s.custodies.filter(c => c.projectId !== projectId), ...custodiesData.map((c) => mapCustody(c, mappedExpenses))],
        milestones: [...s.milestones.filter(m => m.projectId !== projectId), ...milestonesData.map(mapMilestone)],
        changeOrders: [...s.changeOrders.filter(co => co.projectId !== projectId), ...changeOrdersData.map(mapChangeOrder)],
        risks: [...s.risks.filter(r => r.projectId !== projectId), ...risksData.map(mapRisk)],
        projectDataLoaded: loaded,
      }));
    } catch (error) {
      console.error('[Store.loadProjectData]', error);
      throw error;
    }
  },

  loadCompanyData: async (companyId: string) => {
    if (get().detailsLoaded) return;
    try {
      const companyProjects = get().projects.filter(p => p.companyId === companyId);
      const [indirectCosts] = await Promise.all([
        db.from('indirect_costs').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);
      set((s) => ({
        indirectCosts: [...s.indirectCosts.filter(ic => ic.companyId !== companyId), ...(indirectCosts.data || []).map(mapIndirectCost)],
      }));
      for (const p of companyProjects) {
        await get().loadProjectData(p.id);
      }
    } catch (error) {
      console.error('[Store.loadCompanyData]', error);
      throw error;
    }
  },

  loadAuditLog: async (projectId: string) => {
    try {
      const { data, error } = await db
        .from('audit_log').select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      set({
        auditLog: (data as AuditLogRow[] | null ?? []).map((d) => ({
          id: d.id, userId: d.user_id, action: d.action,
          tableName: d.table_name, recordId: d.record_id,
          recordData: d.record_data, projectId: d.project_id || undefined,
          createdAt: d.created_at,
        })),
      });
    } catch (error) {
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

    const channel = db.raw
      .channel(`project-${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        const table = payload.table;

        // التحويلات النقدية: تُطبَّق فوراً (DELETE/UPDATE) بدون إعادة جلب يدوية
        if (table === 'cash_transfers') {
          set((s: AppState) => ({
            cashTransfers: applyCashTransferRealtimeEvent(
              s.cashTransfers,
              payload as unknown as CashTransferRealtimePayload,
            ),
          }));
          return;
        }

        const m = mappers[table];
        if (!m) return;

        set((s: any) => ({
          [m.key]: applyProjectRealtimeEvent(
            s[m.key],
            payload as unknown as ProjectRealtimePayload,
            m.map,
          ),
        }));
      })
      .subscribe();

    return () => { db.raw.removeChannel(channel); };
  },
});
