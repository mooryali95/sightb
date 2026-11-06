import { StateCreator } from 'zustand';
import type { Tables } from '@/integrations/supabase/types';
import { db } from '@/services/db';
import { logger } from '@/lib/logger';
import { BudgetItem, Expense, Revenue } from '@/types/project';
import { getUserId, mapBudgetItem, mapExpense, mapRevenue, upsertById } from '../helpers';
import type { AppState } from '../useStore';

/**
 * What an expense edit may carry. The four link fields accept `null` so an
 * edit can clear a link (the database column goes to NULL); the local row
 * stores the cleared link as `undefined`, which is what `Expense` declares.
 */
export type ExpenseUpdate =
  Partial<Omit<Expense, 'resourceId' | 'custodyId' | 'budgetItemId' | 'fundId'>> & {
    resourceId?: string | null;
    custodyId?: string | null;
    budgetItemId?: string | null;
    fundId?: string | null;
  };

/**
 * An edit to a revenue. A `null` on a link or invoice field clears it; the
 * form sends `null` for a milestone link removed and for the invoice and
 * collection fields a status hides, because `undefined` means "unchanged".
 */
export type RevenueUpdate =
  Omit<Partial<Revenue>, 'milestoneId' | 'invoiceNumber' | 'invoiceDate' | 'collectionDate'> & {
    milestoneId?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    collectionDate?: string | null;
  };

function withoutNulls<T extends object>(e: T): { [K in keyof T]: Exclude<T[K], null> } {
  const out: Record<string, unknown> = { ...(e as Record<string, unknown>) };
  for (const k of Object.keys(out)) if (out[k] === null) out[k] = undefined;
  return out as { [K in keyof T]: Exclude<T[K], null> };
}

export interface BudgetSlice {
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  addBudgetItem: (b: Omit<BudgetItem, 'id'>) => Promise<string>;
  updateBudgetItem: (id: string, b: Partial<BudgetItem>) => Promise<void>;
  deleteBudgetItem: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, 'id'>) => Promise<string>;
  updateExpense: (id: string, e: ExpenseUpdate) => Promise<void>;
  /** `snapshot` is the row as it was, for a caller that already took it off the screen (deleteWithUndo). */
  deleteExpense: (id: string, snapshot?: Expense) => Promise<void>;
  addRevenue: (r: Omit<Revenue, 'id'>) => Promise<string>;
  updateRevenue: (id: string, r: RevenueUpdate) => Promise<void>;
  deleteRevenue: (id: string) => Promise<void>;
}

export const createBudgetSlice: StateCreator<AppState, [], [], BudgetSlice> = (set, get) => ({
  budgetItems: [],
  expenses: [],
  revenues: [],

  addBudgetItem: async (b) => {
    const userId = await getUserId();
    const { data, error } = await db.from('budget_items').insert({
      user_id: userId, project_id: b.projectId, category: b.category,
      description: b.description, planned_amount: b.plannedAmount,
      month: b.month || null, resource_id: b.resourceId || null,
      start_month: b.startMonth || null, end_month: b.endMonth || null,
      cost_type: b.costType || 'fixed', cost_class: b.costClass || 'direct',
    }).select().single();
    if (error) throw error;
    const mapped = mapBudgetItem(data);
    set((s) => ({ budgetItems: upsertById(s.budgetItems, mapped) }));
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
    const { error } = await db.from('budget_items').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ budgetItems: s.budgetItems.map((x) => (x.id === id ? { ...x, ...b } : x)) }));
  },

  deleteBudgetItem: async (id) => {
    const { error } = await db.from('budget_items').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ budgetItems: s.budgetItems.filter((x) => x.id !== id) }));
  },

  addExpense: async (e) => {
    const userId = await getUserId();
    // Field expenses are the most offline-prone write in the app: we mint the id
    // client-side so the optimistic row and the replayed row share a primary key.
    const row = {
      id: crypto.randomUUID(),
      user_id: userId, project_id: e.projectId,
      budget_item_id: e.budgetItemId || null,
      category: e.category, description: e.description,
      amount: e.amount, date: e.date, month: e.month,
      responsible: e.responsible || null, notes: e.notes || null,
      resource_id: e.resourceId || null, custody_id: e.custodyId || null,
      approval_status: e.approvalStatus || 'approved',
      ...(e.partyId ? { party_id: e.partyId } : {}),
      approved_by: e.approvedBy || null,
      vendor: e.vendor || null,
      invoice_ref: e.invoiceRef || null,
      is_vat_exempt: e.isVatExempt ?? false,
      fund_id: e.fundId || null,
      reimburses_payable_id: e.reimbursesPayableId || null,
    };
    const res = (await db.from('expenses', { offline: true }).insert(row).select()) as {
      error?: unknown; data?: Tables<'expenses'>[] | null; queuedOffline?: boolean;
    };
    if (res.error) throw res.error;
    // Offline, the optimistic row stands in for the table row until replay;
    // it lacks the server-filled columns, which mapExpense tolerates.
    const optimistic = row as unknown as Tables<'expenses'>;
    const mapped = mapExpense(res.queuedOffline ? optimistic : (res.data?.[0] ?? optimistic));
    set((s) => ({ expenses: upsertById(s.expenses, mapped) }));
    if (res.queuedOffline) return mapped.id;
    // Reload fund settlements + payables so DB-trigger-updated totals reflect in UI
    if (mapped.fundId) {
      try { await get().loadFundsForProject(e.projectId); }
      catch (err) { logger.warn('store.budget', 'تعذّرت إعادة تحميل العهد بعد إضافة مصروف', { projectId: e.projectId, err: String(err) }); }
    }
    if (mapped.reimbursesPayableId) {
      try { await get().loadResourcePayablesForProject(e.projectId); }
      catch (err) { logger.warn('store.budget', 'تعذّرت إعادة تحميل المستحقات بعد إضافة مصروف', { projectId: e.projectId, err: String(err) }); }
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
    if (e.partyId !== undefined) updates.party_id = e.partyId || null;
    const { error } = await db.from('expenses').update(updates).eq('id', id);
    if (error) throw error;
    const existing = get().expenses.find((x) => x.id === id);
    set((s) => ({ expenses: s.expenses.map((x) => (x.id === id ? { ...x, ...withoutNulls(e) } : x)) }));
    const projectId = existing?.projectId;
    if (projectId && (e.fundId !== undefined || e.amount !== undefined)) {
      try { await get().loadFundsForProject(projectId); }
      catch (err) { logger.warn('store.budget', 'تعذّرت إعادة تحميل العهد بعد تعديل مصروف', { projectId, err: String(err) }); }
    }
  },

  deleteExpense: async (id, snapshot) => {
    const existing = snapshot ?? get().expenses.find((x) => x.id === id);
    const { error } = await db.from('expenses').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
    if (existing?.fundId && existing?.projectId) {
      try { await get().loadFundsForProject(existing.projectId); }
      catch (err) { logger.warn('store.budget', 'تعذّرت إعادة تحميل العهد بعد حذف مصروف', { projectId: existing.projectId, err: String(err) }); }
    }
  },

  addRevenue: async (r) => {
    const userId = await getUserId();
    const { data, error } = await db.from('revenues').insert({
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
    set((s) => ({ revenues: upsertById(s.revenues, mapped) }));
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
    const { error } = await db.from('revenues').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ revenues: s.revenues.map((x) => (x.id === id ? { ...x, ...withoutNulls(r) } : x)) }));
  },

  deleteRevenue: async (id) => {
    const { error } = await db.from('revenues').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ revenues: s.revenues.filter((x) => x.id !== id) }));
  },
});
