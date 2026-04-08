import { StateCreator } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { Milestone, ChangeOrder, Risk, Resource, Custody, Commitment } from '@/types/project';
import {
  getUserId, logDeletion,
  mapMilestone, mapChangeOrder, mapRisk, mapResource, mapCustody, mapCommitment,
} from '../helpers';
import type { AppState } from '../useStore';

export interface TrackingSlice {
  milestones: Milestone[];
  changeOrders: ChangeOrder[];
  risks: Risk[];
  resources: Resource[];
  custodies: Custody[];
  commitments: Commitment[];
  addMilestone: (m: Omit<Milestone, 'id' | 'createdAt'>) => Promise<string>;
  updateMilestone: (id: string, m: Partial<Milestone>) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;
  addChangeOrder: (co: Omit<ChangeOrder, 'id' | 'createdAt'>) => Promise<string>;
  updateChangeOrder: (id: string, co: Partial<ChangeOrder>) => Promise<void>;
  deleteChangeOrder: (id: string) => Promise<void>;
  applyApprovedChangeOrder: (projectId: string, changeOrder: ChangeOrder) => Promise<void>;
  addRisk: (r: Omit<Risk, 'id' | 'createdAt'>) => Promise<string>;
  updateRisk: (id: string, r: Partial<Risk>) => Promise<void>;
  deleteRisk: (id: string) => Promise<void>;
  addResource: (r: Omit<Resource, 'id' | 'createdAt'>) => Promise<string>;
  updateResource: (id: string, r: Partial<Resource>) => Promise<void>;
  deleteResource: (id: string) => Promise<void>;
  addCustody: (c: Omit<Custody, 'id' | 'createdAt' | 'spent' | 'remaining'>) => Promise<string>;
  deleteCustody: (id: string) => Promise<void>;
  addCommitment: (c: Omit<Commitment, 'id' | 'createdAt'>) => Promise<string>;
  updateCommitment: (id: string, c: Partial<Commitment>) => Promise<void>;
  deleteCommitment: (id: string) => Promise<void>;
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

  // ---- ChangeOrder ----
  addChangeOrder: async (co) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('change_orders').insert({
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
    const { error } = await (supabase as any).from('change_orders').update(updates).eq('id', id);
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
    const { error } = await (supabase as any).from('change_orders').delete().eq('id', id);
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
    if (r.description !== undefined) updates.description = r.description || null;
    if (r.probability !== undefined) updates.probability = r.probability;
    if (r.impact !== undefined) updates.impact = r.impact;
    if (r.financialImpact !== undefined) updates.financial_impact = r.financialImpact;
    if (r.category !== undefined) updates.category = r.category;
    if (r.status !== undefined) updates.status = r.status;
    if (r.mitigationPlan !== undefined) updates.mitigation_plan = r.mitigationPlan || null;
    if (r.owner !== undefined) updates.owner = r.owner || null;
    if (r.identifiedDate !== undefined) updates.identified_date = r.identifiedDate;
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

  // ---- Resource ----
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
    const updates: { name?: string; role?: string; monthly_cost?: number } = {};
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

  // ---- Custody ----
  addCustody: async (c) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('custodies').insert({
      user_id: userId, project_id: c.projectId || null,
      company_id: c.companyId || null, resource_name: c.resourceName,
      amount: c.amount, notes: c.notes || null,
      received_date: (c as any).receivedDate || new Date().toISOString().split('T')[0],
      status: 'active',
    } as any).select().single();
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

  // ---- Commitment ----
  addCommitment: async (c) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('commitments').insert({
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
    const { error } = await (supabase as any).from('commitments').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ commitments: s.commitments.map((x) => (x.id === id ? { ...x, ...c } : x)) }));
  },

  deleteCommitment: async (id) => {
    const { error } = await (supabase as any).from('commitments').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ commitments: s.commitments.filter((x) => x.id !== id) }));
  },
});
