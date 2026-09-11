import { StateCreator } from 'zustand';
import { db } from '@/services/db';
import {
  BudgetAmendment,
  BudgetAmendmentSnapshotItem,
  BudgetItem,
} from '@/types/project';
import { getTotalPlanned } from '@/lib/finance';
import { getUserId } from '../helpers';
import type { AppState } from '../useStore';

export interface BudgetAmendmentSlice {
  budgetAmendments: BudgetAmendment[];
  /** يفتح وضع التعديل لمشروع — يأخذ snapshot قبل التعديل ويُرجع id المسودة */
  openBudgetAmendment: (projectId: string, reason: string) => Promise<string>;
  /** يلغي تعديلاً مسودة (الموازنة لم تتغير فعلياً) */
  cancelBudgetAmendment: (amendmentId: string) => Promise<void>;
  /** يعتمد التعديل: يأخذ snapshot الحالي كـ snapshot_after ويغلق المسودة */
  approveBudgetAmendment: (amendmentId: string, approvedBy?: string) => Promise<void>;
  loadBudgetAmendments: (projectId: string) => Promise<BudgetAmendment[]>;
}

function snapshotFromBudgetItems(items: BudgetItem[]): BudgetAmendmentSnapshotItem[] {
  return items.map((b) => ({
    id: b.id,
    category: b.category,
    description: b.description,
    plannedAmount: b.plannedAmount,
    startMonth: b.startMonth,
    endMonth: b.endMonth,
    month: b.month,
    costType: b.costType,
    costClass: b.costClass,
    resourceId: b.resourceId,
  }));
}

/**
 * The total of a snapshot, through the same function the rest of the app uses.
 *
 * This used to carry its own copy of the recurring-months arithmetic, and the
 * copy disagreed with `getTotalPlanned` on one shape: a recurring item with an
 * `endMonth` and no `startMonth`. `getTotalPlanned` reads the missing start as
 * month 1 and counts the span; this counted the amount once. For a 2,000/month
 * line ending in month 6 that is 12,000 against 2,000 — the same budget
 * reporting two different totals depending on which screen asked.
 *
 * No UI produces that shape today: the budget form derives `endMonth` from
 * `startMonth`, and the change-order form never binds its month inputs at all.
 * But nothing prevents it either — not the type, not the database, and not the
 * change-order payload, which already passes the two months independently. One
 * function is cheaper than a rule that everyone has to keep remembering.
 */
function totalOfSnapshot(items: BudgetAmendmentSnapshotItem[]): number {
  return getTotalPlanned(items);
}

function mapAmendment(d: any): BudgetAmendment {
  return {
    id: d.id,
    projectId: d.project_id,
    reason: d.reason,
    snapshotBefore: (d.snapshot_before || []) as BudgetAmendmentSnapshotItem[],
    snapshotAfter: d.snapshot_after ? (d.snapshot_after as BudgetAmendmentSnapshotItem[]) : undefined,
    totalBefore: Number(d.total_before ?? 0),
    totalAfter: d.total_after !== null && d.total_after !== undefined ? Number(d.total_after) : undefined,
    status: d.status,
    approvedBy: d.approved_by || undefined,
    approvedAt: d.approved_at || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

export const createBudgetAmendmentSlice: StateCreator<AppState, [], [], BudgetAmendmentSlice> = (set, get) => ({
  budgetAmendments: [],

  openBudgetAmendment: async (projectId, reason) => {
    const userId = await getUserId();
    const currentBudget = get().budgetItems.filter((b) => b.projectId === projectId);
    const snapshot = snapshotFromBudgetItems(currentBudget);
    const totalBefore = totalOfSnapshot(snapshot);

    const { data, error } = await db
      .from('budget_amendments')
      .insert({
        user_id: userId,
        project_id: projectId,
        reason: reason.trim(),
        snapshot_before: snapshot,
        total_before: totalBefore,
        status: 'draft',
      })
      .select()
      .single();
    if (error) throw error;

    const mapped = mapAmendment(data);
    set((s) => ({ budgetAmendments: [mapped, ...s.budgetAmendments] }));
    return mapped.id;
  },

  cancelBudgetAmendment: async (amendmentId) => {
    const { error } = await db
      .from('budget_amendments')
      .update({ status: 'cancelled' })
      .eq('id', amendmentId);
    if (error) throw error;
    set((s) => ({
      budgetAmendments: s.budgetAmendments.map((a) =>
        a.id === amendmentId ? { ...a, status: 'cancelled' } : a
      ),
    }));
  },

  approveBudgetAmendment: async (amendmentId, approvedBy) => {
    const amendment = get().budgetAmendments.find((a) => a.id === amendmentId);
    if (!amendment) throw new Error('التعديل غير موجود');

    const currentBudget = get().budgetItems.filter((b) => b.projectId === amendment.projectId);
    const snapshotAfter = snapshotFromBudgetItems(currentBudget);
    const totalAfter = totalOfSnapshot(snapshotAfter);

    const { data, error } = await db
      .from('budget_amendments')
      .update({
        snapshot_after: snapshotAfter,
        total_after: totalAfter,
        status: 'approved',
        approved_by: approvedBy || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', amendmentId)
      .select()
      .single();
    if (error) throw error;

    const mapped = mapAmendment(data);
    set((s) => ({
      budgetAmendments: s.budgetAmendments.map((a) => (a.id === amendmentId ? mapped : a)),
    }));
  },

  loadBudgetAmendments: async (projectId) => {
    const { data, error } = await db
      .from('budget_amendments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const mapped = (data || []).map(mapAmendment);
    set((s) => ({
      budgetAmendments: [
        ...s.budgetAmendments.filter((a) => a.projectId !== projectId),
        ...mapped,
      ],
    }));
    return mapped;
  },
});
