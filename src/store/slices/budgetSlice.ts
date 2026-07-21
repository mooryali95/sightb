import { StateCreator } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { BudgetItem, Expense, Revenue } from '@/types/project';
import { getUserId, mapBudgetItem, mapExpense, mapRevenue } from '../helpers';
import type { AppState } from '../useStore';

export interface BudgetSlice {
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  addBudgetItem: (b: Omit<BudgetItem, 'id'>) => Promise<string>;
  updateBudgetItem: (id: string, b: Partial<BudgetItem>) => Promise<void>;
  deleteBudgetItem: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, 'id'>) => Promise<string>;
  updateExpense: (id: string, e: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addRevenue: (r: Omit<Revenue, 'id'>) => Promise<string>;
  updateRevenue: (id: string, r: Partial<Revenue>) => Promise<void>;
  deleteRevenue: (id: string) => Promise<void>;
}

export const createBudgetSlice: StateCreator<AppState, [], [], BudgetSlice> = (set, get) => ({
  budgetItems: [],
  expenses: [],
  revenues: [],

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

  addExpense: async (e) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('expenses').insert({
      user_id: userId, project_id: e.projectId,
      budget_item_id: e.budgetItemId || null,
      category: e.category, description: e.description,
      amount: e.amount, date: e.date, month: e.month,
      responsible: e.responsible || null, notes: e.notes || null,
      resource_id: e.resourceId || null, custody_id: e.custodyId || null,
      approval_status: e.approvalStatus || 'approved',
      approved_by: e.approvedBy || null,
      vendor: e.vendor || null,
      invoice_ref: e.invoiceRef || null,
      is_vat_exempt: e.isVatExempt ?? false,
      fund_id: e.fundId || null,
      reimburses_payable_id: (e as any).reimbursesPayableId || null,
    }).select().single();
    if (error) throw error;
    const mapped = mapExpense(data);
    set((s) => ({ expenses: [mapped, ...s.expenses] }));
    // Reload fund settlements + payables so DB-trigger-updated totals reflect in UI
    if (mapped.fundId) {
      try { await (get() as any).loadFundsForProject?.(e.projectId); } catch {}
    }
    if (mapped.reimbursesPayableId) {
      try { await (get() as any).loadResourcePayablesForProject?.(e.projectId); } catch {}
    }
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
    if (e.budgetItemId !== undefined) updates.budget_item_id = e.budgetItemId || null;
    if (e.custodyId !== undefined) updates.custody_id = e.custodyId || null;
    if (e.resourceId !== undefined) updates.resource_id = e.resourceId || null;
    if (e.approvalStatus !== undefined) updates.approval_status = e.approvalStatus;
    if (e.approvedBy !== undefined) updates.approved_by = e.approvedBy;
    if (e.vendor !== undefined) updates.vendor = e.vendor;
    if (e.invoiceRef !== undefined) updates.invoice_ref = e.invoiceRef;
    if (e.isVatExempt !== undefined) updates.is_vat_exempt = e.isVatExempt;
    if (e.fundId !== undefined) updates.fund_id = e.fundId || null;
    const { error } = await (supabase as any).from('expenses').update(updates).eq('id', id);
    if (error) throw error;
    const existing = get().expenses.find((x) => x.id === id);
    set((s) => ({ expenses: s.expenses.map((x) => (x.id === id ? { ...x, ...e } : x)) }));
    const projectId = existing?.projectId;
    if (projectId && (e.fundId !== undefined || e.amount !== undefined)) {
      try { await (get() as any).loadFundsForProject?.(projectId); } catch {}
    }
  },

  deleteExpense: async (id) => {
    const existing = get().expenses.find((x) => x.id === id);
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
    if (existing?.fundId && existing?.projectId) {
      try { await (get() as any).loadFundsForProject?.(existing.projectId); } catch {}
    }
  },

  addRevenue: async (r) => {
    const userId = await getUserId();
    const { data, error } = await (supabase as any).from('revenues').insert({
      user_id: userId, project_id: r.projectId,
      description: r.description, amount: r.amount, date: r.date, month: r.month,
      revenue_type: r.revenueType || 'milestone',
      status: r.status || 'collected',
      milestone_id: r.milestoneId || null,
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
    if (r.milestoneId !== undefined) updates.milestone_id = r.milestoneId;
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
});
