import { StateCreator } from 'zustand';
import { db } from '@/services/db';
import { Milestone, ChangeOrder, Risk, Resource, Custody, Commitment, RiskUpdate, MilestoneUpdate, CommitmentUpdate } from '@/types/project';
import {
  getUserId, logDeletion,
  mapMilestone, mapChangeOrder, mapRisk, mapResource, mapCustody, mapCommitment,
} from '../helpers';
import type { AppState } from '../useStore';

/**
 * What a custody edit may carry. `sourceFundId` and `notes` accept `null` so
 * an edit can clear them (the column goes to NULL); the local row stores a
 * cleared field as `undefined`, which is what `Custody` declares. Declared
 * with Omit rather than an intersection: intersecting `string | undefined`
 * with `string | null` narrows to `string`, which is why the old signature
 * only ever accepted null through a cast.
 */
export type CustodyUpdate = Partial<Omit<Custody, 'sourceFundId' | 'notes'>> & {
  sourceFundId?: string | null;
  notes?: string | null;
};

export interface TrackingSlice {
  milestones: Milestone[];
  changeOrders: ChangeOrder[];
  risks: Risk[];
  resources: Resource[];
  custodies: Custody[];
  commitments: Commitment[];
  addMilestone: (m: Omit<Milestone, 'id' | 'createdAt'>) => Promise<string>;
  updateMilestone: (id: string, m: MilestoneUpdate) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;
  addChangeOrder: (co: Omit<ChangeOrder, 'id' | 'createdAt'>) => Promise<string>;
  updateChangeOrder: (id: string, co: Partial<ChangeOrder>) => Promise<void>;
  deleteChangeOrder: (id: string) => Promise<void>;
  applyApprovedChangeOrder: (projectId: string, changeOrder: ChangeOrder) => Promise<void>;
  addRisk: (r: Omit<Risk, 'id' | 'createdAt'>) => Promise<string>;
  updateRisk: (id: string, r: RiskUpdate) => Promise<void>;
  deleteRisk: (id: string) => Promise<void>;
  addResource: (r: Omit<Resource, 'id' | 'createdAt'>) => Promise<string>;
  updateResource: (id: string, r: Partial<Resource>) => Promise<void>;
  deleteResource: (id: string) => Promise<void>;
  addCustody: (c: Omit<Custody, 'id' | 'createdAt' | 'spent' | 'remaining'>) => Promise<string>;
  updateCustody: (id: string, c: CustodyUpdate) => Promise<void>;
  deleteCustody: (id: string) => Promise<void>;
  addCommitment: (c: Omit<Commitment, 'id' | 'createdAt'>) => Promise<string>;
  updateCommitment: (id: string, c: CommitmentUpdate) => Promise<void>;
  deleteCommitment: (id: string) => Promise<void>;
}

/**
 * Merges a write payload into the cached risk.
 *
 * A cleared column arrives as `null` (that is how `updateRisk` tells the
 * database to blank it), but `mapRisk` hands back `undefined` for the same
 * column on the next load. Collapsing here keeps the cached row identical to
 * what a reload would produce — otherwise `risk.owner` reads as `null` until
 * the page is refreshed and `undefined` afterwards.
 */
function applyRiskUpdate(current: Risk, update: RiskUpdate): Risk {
  const merged = { ...current, ...update };
  return {
    ...merged,
    description: merged.description || undefined,
    mitigationPlan: merged.mitigationPlan || undefined,
    owner: merged.owner || undefined,
  };
}

/** Same collapse for a milestone: a cleared column is `null` on the wire and `undefined` in the row. */
function applyMilestoneUpdate(current: Milestone, update: MilestoneUpdate): Milestone {
  const merged = { ...current, ...update };
  return {
    ...merged,
    description: merged.description || undefined,
    plannedStart: merged.plannedStart || undefined,
    plannedEnd: merged.plannedEnd || undefined,
    actualStart: merged.actualStart || undefined,
    actualEnd: merged.actualEnd || undefined,
    linkedRevenueId: merged.linkedRevenueId || undefined,
  };
}

/** And for a commitment. */
function applyCommitmentUpdate(current: Commitment, update: CommitmentUpdate): Commitment {
  const merged = { ...current, ...update };
  return {
    ...merged,
    vendorName: merged.vendorName || undefined,
    contractRef: merged.contractRef || undefined,
    notes: merged.notes || undefined,
  };
}

export const createTrackingSlice: StateCreator<AppState, [], [], TrackingSlice> = (set, get) => ({
  milestones: [],
  changeOrders: [],
  risks: [],
  resources: [],
  custodies: [],
  commitments: [],

  // ---- Milestone ----
  addMilestone: async (m) => {
    const userId = await getUserId();
    const { data, error } = await db.from('milestones').insert({
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
    const { error } = await db.from('milestones').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ milestones: s.milestones.map((x) => (x.id === id ? applyMilestoneUpdate(x, m) : x)) }));
  },

  deleteMilestone: async (id) => {
    const ms = get().milestones.find(m => m.id === id);
    if (ms) await logDeletion('milestones', id, ms, ms.projectId);
    const { error } = await db.from('milestones').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ milestones: s.milestones.filter((x) => x.id !== id) }));
  },

  // ---- ChangeOrder ----
  addChangeOrder: async (co) => {
    const userId = await getUserId();
    const { data, error } = await db.from('change_orders').insert({
      project_id: co.projectId, user_id: userId, description: co.description,
      change_type: co.changeType || 'scope_addition',
      amount_impact: co.amountImpact || 0, duration_impact: co.durationImpact || 0,
      status: co.status || 'proposed',
      requested_by: co.requestedBy || null, approved_by: co.approvedBy || null,
      approved_date: co.approvedDate || null,
      budget_items_json: JSON.stringify(co.budgetItems || []),
      auto_rebaseline: co.autoRebaseline !== false,
    }).select().single();
    if (error) throw error;
    const mapped = mapChangeOrder(data);
    set((s) => ({ changeOrders: [mapped, ...s.changeOrders] }));
    if (co.status === 'approved' && (co.budgetItems || []).length > 0) {
      await get().applyApprovedChangeOrder(co.projectId, mapped);
    }
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
    if (co.budgetItems !== undefined) updates.budget_items_json = JSON.stringify(co.budgetItems);
    if (co.autoRebaseline !== undefined) updates.auto_rebaseline = co.autoRebaseline;
    const { error } = await db.from('change_orders').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ changeOrders: s.changeOrders.map((x) => (x.id === id ? { ...x, ...co } : x)) }));
    if (co.status === 'approved') {
      const changeOrder = get().changeOrders.find(c => c.id === id);
      if (changeOrder && (changeOrder.budgetItems || []).length > 0) {
        await get().applyApprovedChangeOrder(changeOrder.projectId, changeOrder);
      }
    }
  },

  deleteChangeOrder: async (id) => {
    const co = get().changeOrders.find(c => c.id === id);
    if (co) await logDeletion('change_orders', id, co, co.projectId);
    const { error } = await db.from('change_orders').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ changeOrders: s.changeOrders.filter((x) => x.id !== id) }));
  },

  applyApprovedChangeOrder: async (projectId, changeOrder) => {
    const { toast } = await import('sonner');
    const items = changeOrder.budgetItems || [];
    for (const bi of items) {
      await get().addBudgetItem({
        projectId,
        category: bi.category,
        description: `[أمر تغيير] ${bi.description}`,
        plannedAmount: bi.plannedAmount,
        costType: bi.costType,
        costClass: 'direct',
        startMonth: bi.startMonth,
        endMonth: bi.endMonth,
      });
    }
    if (changeOrder.autoRebaseline !== false) {
      try {
        const baselines = get().baselines.filter(b => b.projectId === projectId);
        const ver = baselines.length > 0 ? Math.max(...baselines.map(b => b.version)) : 0;
        await get().createBaseline(projectId, `v${ver + 1} — ${changeOrder.description.substring(0, 40)}`);
        toast.success('تم إضافة البنود وإعادة تثبيت خط الأساس');
      } catch (e) {
        console.error('Auto-rebaseline failed:', e);
        toast.error('تم إضافة بنود أمر التغيير، لكن فشل إنشاء خط الأساس تلقائياً. يرجى إنشاؤه يدوياً من تبويب خط الأساس.');
      }
    }
  },

  // ---- Risk ----
  addRisk: async (r) => {
    const userId = await getUserId();
    const { data, error } = await db.from('risks').insert({
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
    if (r.description !== undefined) updates.description = r.description || null;
    if (r.probability !== undefined) updates.probability = r.probability;
    if (r.impact !== undefined) updates.impact = r.impact;
    if (r.financialImpact !== undefined) updates.financial_impact = r.financialImpact;
    if (r.category !== undefined) updates.category = r.category;
    if (r.status !== undefined) updates.status = r.status;
    if (r.mitigationPlan !== undefined) updates.mitigation_plan = r.mitigationPlan || null;
    if (r.owner !== undefined) updates.owner = r.owner || null;
    if (r.identifiedDate !== undefined) updates.identified_date = r.identifiedDate;
    if (r.closedDate !== undefined) updates.closed_date = r.closedDate;
    const { error } = await db.from('risks').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ risks: s.risks.map((x) => (x.id === id ? applyRiskUpdate(x, r) : x)) }));
  },

  deleteRisk: async (id) => {
    const risk = get().risks.find(r => r.id === id);
    if (risk) await logDeletion('risks', id, risk, risk.projectId);
    const { error } = await db.from('risks').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ risks: s.risks.filter((x) => x.id !== id) }));
  },

  // ---- Resource ----
  addResource: async (r) => {
    const userId = await getUserId();
    const { data, error } = await db.from('resources').insert({
      user_id: userId, project_id: r.projectId,
      name: r.name, role: r.role || null, monthly_cost: r.monthlyCost,
    }).select().single();
    if (error) throw error;
    const mapped = mapResource(data);
    set((s) => ({ resources: [mapped, ...s.resources] }));
    // Update resource_count on project
    const newCount = get().resources.filter(res => res.projectId === r.projectId).length;
    await db.from('projects').update({ resource_count: newCount }).eq('id', r.projectId);
    set((s) => ({ projects: s.projects.map(p => p.id === r.projectId ? { ...p, resourceCount: newCount } : p) }));
    return mapped.id;
  },

  updateResource: async (id, r) => {
    const updates: { name?: string; role?: string; monthly_cost?: number } = {};
    if (r.name !== undefined) updates.name = r.name;
    if (r.role !== undefined) updates.role = r.role;
    if (r.monthlyCost !== undefined) updates.monthly_cost = r.monthlyCost;
    const { error } = await db.from('resources').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ resources: s.resources.map((x) => (x.id === id ? { ...x, ...r } : x)) }));
  },

  deleteResource: async (id) => {
    const resource = get().resources.find(r => r.id === id);
    const { error } = await db.from('resources').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ resources: s.resources.filter((x) => x.id !== id) }));
    // Update resource_count on project
    if (resource) {
      const newCount = get().resources.filter(res => res.projectId === resource.projectId).length;
      await db.from('projects').update({ resource_count: newCount }).eq('id', resource.projectId);
      set((s) => ({ projects: s.projects.map(p => p.id === resource.projectId ? { ...p, resourceCount: newCount } : p) }));
    }
  },

  // ---- Custody ----
  addCustody: async (c) => {
    const userId = await getUserId();
    const { data, error } = await db.from('custodies').insert({
      user_id: userId, project_id: c.projectId || null,
      company_id: c.companyId || null, resource_name: c.resourceName,
      amount: c.amount, notes: c.notes || null,
      received_date: c.receivedDate || new Date().toISOString().split('T')[0],
      status: 'active',
      source_fund_id: c.sourceFundId || null,
    }).select().single();
    if (error) {
      const msg = error.message || '';
      if (msg.includes('مبلغ العهدة يتجاوز')) throw new Error(msg);
      throw error;
    }
    const mapped = mapCustody(data, get().expenses);
    set((s) => ({ custodies: [mapped, ...s.custodies] }));
    return mapped.id;
  },

  updateCustody: async (id, c) => {
    const updates: Record<string, unknown> = {};
    if (c.resourceName !== undefined) updates.resource_name = c.resourceName;
    if (c.amount !== undefined) updates.amount = c.amount;
    if (c.notes !== undefined) updates.notes = c.notes;
    if (c.receivedDate !== undefined) updates.received_date = c.receivedDate;
    if (c.sourceFundId !== undefined) updates.source_fund_id = c.sourceFundId || null;
    if (c.status !== undefined) updates.status = c.status;
    if (c.closedDate !== undefined) updates.closed_date = c.closedDate || null;
    const { error } = await db.from('custodies').update(updates).eq('id', id);
    if (error) throw error;
    // The patch accepts `sourceFundId: null` and `notes: null` to mean
    // "clear it", which the Custody type spells as absent. Normalising here
    // keeps the stored shape honest instead of casting the mismatch away.
    const { sourceFundId, notes, ...rest } = c;
    set((s) => ({
      custodies: s.custodies.map((x) =>
        x.id === id ? {
          ...x,
          ...rest,
          ...(sourceFundId === undefined ? {} : { sourceFundId: sourceFundId ?? undefined }),
          ...(notes === undefined ? {} : { notes: notes ?? undefined }),
        } : x),
    }));
  },

  deleteCustody: async (id) => {
    const { error } = await db.from('custodies').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ custodies: s.custodies.filter((x) => x.id !== id) }));
  },

  // ---- Commitment ----
  addCommitment: async (c) => {
    const userId = await getUserId();
    const { data, error } = await db.from('commitments').insert({
      user_id: userId, project_id: c.projectId, description: c.description,
      vendor_name: c.vendorName || null, contract_ref: c.contractRef || null,
      total_amount: c.totalAmount || 0, spent_amount: c.spentAmount || 0,
      status: c.status || 'active', budget_item_id: c.budgetItemId || null,
      start_date: c.startDate || null, end_date: c.endDate || null, notes: c.notes || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapCommitment(data);
    set((s) => ({ commitments: [mapped, ...s.commitments] }));
    return mapped.id;
  },

  updateCommitment: async (id, c) => {
    const updates: Record<string, unknown> = {};
    if (c.description !== undefined) updates.description = c.description;
    if (c.vendorName !== undefined) updates.vendor_name = c.vendorName;
    if (c.contractRef !== undefined) updates.contract_ref = c.contractRef;
    if (c.totalAmount !== undefined) updates.total_amount = c.totalAmount;
    if (c.spentAmount !== undefined) updates.spent_amount = c.spentAmount;
    if (c.status !== undefined) updates.status = c.status;
    if (c.notes !== undefined) updates.notes = c.notes;
    const { error } = await db.from('commitments').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ commitments: s.commitments.map((x) => (x.id === id ? applyCommitmentUpdate(x, c) : x)) }));
  },

  deleteCommitment: async (id) => {
    const { error } = await db.from('commitments').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ commitments: s.commitments.filter((x) => x.id !== id) }));
  },
});
