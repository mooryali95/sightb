/**
 * spend-consistency.ts — كشف فجوات/عدم اتساق الصرف على مستوى المورد أو الفئة،
 * ومقارنة الأرقام «قبل الإصلاح» و«بعد الإصلاح» للتحويلات بلا مصدر.
 *
 * التعريفات:
 *  - «بعد»  = الأرقام الحالية بعد حذف التحويلات اليتيمة (الحقيقة الحالية).
 *  - «قبل»  = الأرقام كما كانت قبل الإصلاح = بعد + حصة المجموعة من مبالغ الإصلاح،
 *             موزّعة على مجموعات المصروفات المرتبطة بنفس العهدة تناسبياً.
 *  - «فجوة غير مرتبطة» = مصروف بلا دفعة وبلا عهدة (كسر لقاعدة المصدر الواحد).
 *
 * كل الدوال خالصة وقابلة للاختبار.
 */
import type { Expense } from '@/types/project';
import { EXPENSE_CATEGORY_LABELS } from '@/types/project';
import { UNASSIGNED_KEY, UNASSIGNED_LABEL, type SpendLookups } from './expense-analytics';

export type ConsistencyDimension = 'resource' | 'category';

export interface RepairRecord {
  id: string;
  custodyId: string | null;
  amount: number;
}

export interface ConsistencyRow {
  key: string;
  label: string;
  /** الصرف الحالي (الحقيقة). */
  after: number;
  /** الصرف/التمويل كما كان محسوباً قبل الإصلاح. */
  before: number;
  /** before − after — قيمة التضخّم الذي أُزيل. */
  gap: number;
}

export interface UnlinkedRow {
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface ConsistencyReport {
  dimension: ConsistencyDimension;
  rows: ConsistencyRow[];
  totalBefore: number;
  totalAfter: number;
  totalGap: number;
  unlinked: UnlinkedRow[];
  totalUnlinked: number;
  unlinkedCount: number;
  hasIssues: boolean;
}

function groupOf(dim: ConsistencyDimension, e: Expense, look: SpendLookups): { key: string; label: string } {
  if (dim === 'category') {
    return { key: e.category, label: EXPENSE_CATEGORY_LABELS[e.category] || e.category };
  }
  if (!e.resourceId) return { key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL };
  const r = look.resources?.find((x) => x.id === e.resourceId);
  return { key: e.resourceId, label: r?.name || e.resourceId };
}

function isCounted(e: Expense): boolean {
  return (e.approvalStatus || 'approved') !== 'rejected';
}

export function buildSpendConsistency(
  expenses: Expense[],
  repairs: RepairRecord[],
  dimension: ConsistencyDimension,
  look: SpendLookups = {},
): ConsistencyReport {
  const rows = new Map<string, ConsistencyRow>();
  const ensure = (key: string, label: string): ConsistencyRow => {
    let r = rows.get(key);
    if (!r) { r = { key, label, after: 0, before: 0, gap: 0 }; rows.set(key, r); }
    return r;
  };

  const counted = expenses.filter(isCounted);
  for (const e of counted) {
    const { key, label } = groupOf(dimension, e, look);
    const r = ensure(key, label);
    r.after += e.amount;
    r.before += e.amount;
  }

  // توزيع مبالغ الإصلاح على المجموعات المرتبطة بنفس العهدة تناسبياً.
  for (const rep of repairs) {
    const amount = Number(rep.amount) || 0;
    if (amount <= 0) continue;
    const linked = rep.custodyId ? counted.filter((e) => e.custodyId === rep.custodyId) : [];
    const base = linked.reduce((s, e) => s + e.amount, 0);
    if (linked.length === 0 || base <= 0) {
      const r = ensure(UNASSIGNED_KEY, UNASSIGNED_LABEL);
      r.before += amount;
      continue;
    }
    for (const e of linked) {
      const { key, label } = groupOf(dimension, e, look);
      const r = ensure(key, label);
      r.before += amount * (e.amount / base);
    }
  }

  const unlinkedMap = new Map<string, UnlinkedRow>();
  for (const e of counted) {
    if (e.fundId || e.custodyId) continue;
    const { key, label } = groupOf(dimension, e, look);
    const u = unlinkedMap.get(key) || { key, label, amount: 0, count: 0 };
    u.amount += e.amount;
    u.count += 1;
    unlinkedMap.set(key, u);
  }

  const list = Array.from(rows.values())
    .map((r) => ({ ...r, gap: r.before - r.after }))
    .sort((a, b) => (b.gap - a.gap) || (b.after - a.after));

  const totalAfter = list.reduce((s, r) => s + r.after, 0);
  const totalBefore = list.reduce((s, r) => s + r.before, 0);
  const unlinked = Array.from(unlinkedMap.values()).sort((a, b) => b.amount - a.amount);
  const totalUnlinked = unlinked.reduce((s, u) => s + u.amount, 0);
  const totalGap = totalBefore - totalAfter;

  return {
    dimension,
    rows: list,
    totalBefore,
    totalAfter,
    totalGap,
    unlinked,
    totalUnlinked,
    unlinkedCount: unlinked.reduce((s, u) => s + u.count, 0),
    hasIssues: Math.abs(totalGap) > 0.01 || totalUnlinked > 0.01,
  };
}

/* ------------------------------------------------------------------ */
/* مقارنة تفصيلية لكل مجموعة (مورد/فئة): ما الذي تغيّر قبل/بعد الإصلاح  */
/* ------------------------------------------------------------------ */

export interface ComparisonLine {
  /** معرّف المصروف، أو معرّف الإصلاح للأسطر غير المرتبطة بمصروف. */
  id: string;
  kind: 'expense' | 'repair';
  date: string | null;
  description: string;
  categoryLabel: string;
  custodyId: string | null;
  /** الرقم الحالي (الحقيقة بعد الإصلاح). */
  after: number;
  /** الرقم كما كان محسوباً قبل الإصلاح. */
  before: number;
  /** before − after. */
  diff: number;
}

export interface RowComparison {
  key: string;
  label: string;
  before: number;
  after: number;
  gap: number;
  changedCount: number;
  lines: ComparisonLine[];
}

/**
 * يبني تفصيل «ما الذي تغيّر» لمجموعة واحدة: كل عنصر صرف مع رقمه قبل وبعد
 * وفرق المبلغ، إضافة إلى مبالغ الإصلاح التي لم تُنسب إلى أي مصروف.
 */
export function buildRowComparison(
  groupKey: string,
  expenses: Expense[],
  repairs: RepairRecord[],
  dimension: ConsistencyDimension,
  look: SpendLookups = {},
): RowComparison {
  const counted = expenses.filter(isCounted);
  const label =
    counted.map((e) => groupOf(dimension, e, look)).find((g) => g.key === groupKey)?.label ??
    (groupKey === UNASSIGNED_KEY ? UNASSIGNED_LABEL : groupKey);

  const lines = new Map<string, ComparisonLine>();
  for (const e of counted) {
    if (groupOf(dimension, e, look).key !== groupKey) continue;
    lines.set(e.id, {
      id: e.id,
      kind: 'expense',
      date: e.date ?? null,
      description: e.description,
      categoryLabel: EXPENSE_CATEGORY_LABELS[e.category] || e.category,
      custodyId: e.custodyId ?? null,
      after: e.amount,
      before: e.amount,
      diff: 0,
    });
  }

  for (const rep of repairs) {
    const amount = Number(rep.amount) || 0;
    if (amount <= 0) continue;
    const linked = rep.custodyId ? counted.filter((e) => e.custodyId === rep.custodyId) : [];
    const base = linked.reduce((s, e) => s + e.amount, 0);
    if (linked.length === 0 || base <= 0) {
      if (groupKey !== UNASSIGNED_KEY) continue;
      lines.set(`repair-${rep.id}`, {
        id: rep.id,
        kind: 'repair',
        date: null,
        description: 'تحويل بلا مصدر — تم حذفه',
        categoryLabel: '—',
        custodyId: rep.custodyId,
        after: 0,
        before: amount,
        diff: amount,
      });
      continue;
    }
    for (const e of linked) {
      const line = lines.get(e.id);
      if (!line) continue;
      const share = amount * (e.amount / base);
      line.before += share;
      line.diff += share;
    }
  }

  const list = Array.from(lines.values()).sort((a, b) => (b.diff - a.diff) || (b.after - a.after));
  const after = list.reduce((s, l) => s + l.after, 0);
  const before = list.reduce((s, l) => s + l.before, 0);
  return {
    key: groupKey,
    label,
    before,
    after,
    gap: before - after,
    changedCount: list.filter((l) => Math.abs(l.diff) > 0.01).length,
    lines: list,
  };
}
