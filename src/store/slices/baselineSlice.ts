import { StateCreator } from 'zustand';
import { db } from '@/services/db';
import { CostBaseline, IndirectCost, PeriodicSnapshot } from '@/types/project';
import { getTotalPlanned } from '@/lib/finance';
import {
  getUserId, logDeletion, mapBaselineItem, mapIndirectCost, mapSnapshot, upsertById } from '../helpers';
import type { AppState } from '../useStore';

export interface BaselineSlice {
  baselines: CostBaseline[];
  indirectCosts: IndirectCost[];
  snapshots: PeriodicSnapshot[];
  createBaseline: (projectId: string, name: string) => Promise<string>;
  deleteBaseline: (id: string) => Promise<void>;
  setActiveBaseline: (id: string, projectId: string) => Promise<void>;
  loadBaselines: (projectId: string) => Promise<CostBaseline[]>;
  addIndirectCost: (ic: Omit<IndirectCost, 'id' | 'createdAt'>) => Promise<string>;
  updateIndirectCost: (id: string, ic: Partial<IndirectCost>) => Promise<void>;
  deleteIndirectCost: (id: string) => Promise<void>;
  saveSnapshot: (s: Omit<PeriodicSnapshot, 'id' | 'createdAt'>) => Promise<string>;
  loadSnapshots: (entityType: string, entityId: string) => Promise<PeriodicSnapshot[]>;
}

export const createBaselineSlice: StateCreator<AppState, [], [], BaselineSlice> = (set, get) => ({
  baselines: [],
  indirectCosts: [],
  snapshots: [],

  createBaseline: async (projectId, name) => {
    const userId = await getUserId();
    const currentBudget = get().budgetItems.filter(b => b.projectId === projectId);
    if (currentBudget.length === 0) throw new Error('لا توجد بنود موازنة لإنشاء خط أساس');

    const existingBaselines = get().baselines.filter(b => b.projectId === projectId);
    const nextVersion = existingBaselines.length > 0
      ? Math.max(...existingBaselines.map(b => b.version)) + 1 : 1;

    const totalPlanned = getTotalPlanned(currentBudget);

    if (existingBaselines.length > 0) {
      await db.from('cost_baselines').update({ is_active: false }).eq('project_id', projectId);
    }

    const { data: bl, error: blErr } = await db.from('cost_baselines').insert({
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

    const { data: items, error: itemsErr } = await db
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
    const { error } = await db.from('cost_baselines').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ baselines: s.baselines.filter(b => b.id !== id) }));
  },

  setActiveBaseline: async (id, projectId) => {
    await db.from('cost_baselines').update({ is_active: false }).eq('project_id', projectId);
    const { error } = await db.from('cost_baselines').update({ is_active: true }).eq('id', id);
    if (error) throw error;
    set((s) => ({ baselines: s.baselines.map(b => b.projectId === projectId ? { ...b, isActive: b.id === id } : b) }));
  },

  loadBaselines: async (projectId) => {
    const { data: bls, error } = await db
      .from('cost_baselines').select('*').eq('project_id', projectId).order('version', { ascending: false });
    if (error) throw error;

    const baselines: CostBaseline[] = [];
    for (const bl of (bls || [])) {
      const { data: items } = await db.from('baseline_items').select('*').eq('baseline_id', bl.id);
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

  // ---- IndirectCost ----
  addIndirectCost: async (ic) => {
    const userId = await getUserId();
    const { data, error } = await db.from('indirect_costs').insert({
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
    set((s) => ({ indirectCosts: upsertById(s.indirectCosts, mapped) }));
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
    const { error } = await db.from('indirect_costs').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ indirectCosts: s.indirectCosts.map((x) => (x.id === id ? { ...x, ...ic } : x)) }));
  },

  deleteIndirectCost: async (id) => {
    const { error } = await db.from('indirect_costs').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ indirectCosts: s.indirectCosts.filter((x) => x.id !== id) }));
  },

  // ---- Snapshot ----
  saveSnapshot: async (s) => {
    const userId = await getUserId();
    const { data, error } = await db.from('periodic_snapshots').upsert({
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
    const { data, error } = await db.from('periodic_snapshots').select('*')
      .eq('entity_type', entityType).eq('entity_id', entityId)
      .order('snapshot_date', { ascending: false });
    if (error) throw error;
    const mapped = (data || []).map(mapSnapshot);
    set((s) => ({
      snapshots: [...s.snapshots.filter(x => !(x.entityType === entityType && x.entityId === entityId)), ...mapped],
    }));
    return mapped;
  },
});
