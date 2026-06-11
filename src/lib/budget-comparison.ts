/**
 * Budget vs Planned vs Actual comparison helpers.
 * Pure functions — no side effects, fully testable.
 */
import {
  BudgetItem, Expense, ExpenseCategory, EXPENSE_CATEGORY_LABELS,
} from '@/types/project';

export interface ItemComparison {
  id: string;
  description: string;
  category: ExpenseCategory;
  planned: number;          // total budgeted amount (BAC for the item)
  plannedToDate: number;    // PV — how much should have been spent by currentMonth
  actual: number;           // AC — actual spent so far
  variance: number;         // actual − plannedToDate (positive = overspending)
  variancePct: number;      // |variance| / plannedToDate (0 when PV is 0)
  consumptionPct: number;   // actual / planned (0 when planned is 0)
  severity: 'good' | 'warning' | 'critical';
  remaining: number;        // planned − actual
}

export interface CategoryGroup {
  category: ExpenseCategory;
  label: string;
  planned: number;
  plannedToDate: number;
  actual: number;
  variance: number;
  variancePct: number;
  consumptionPct: number;
  remaining: number;
  severity: 'good' | 'warning' | 'critical';
  items: ItemComparison[];
}

/**
 * Spread the planned amount of a budget item over the months it covers.
 * Returns an array indexed 1..durationMonths (index 0 unused).
 */
export function distributeBudgetItem(
  item: Pick<BudgetItem, 'plannedAmount' | 'costType' | 'startMonth' | 'endMonth' | 'month'>,
  durationMonths: number,
): number[] {
  const arr = new Array(durationMonths + 1).fill(0);
  const amount = Number(item.plannedAmount) || 0;
  if (amount === 0 || durationMonths < 1) return arr;

  if (item.costType === 'one_time') {
    const m = Math.max(1, Math.min(durationMonths, item.month || item.startMonth || 1));
    arr[m] = amount;
    return arr;
  }

  if (item.costType === 'recurring') {
    // plannedAmount is the MONTHLY amount; spread between start/end
    const start = Math.max(1, item.startMonth || 1);
    const end = Math.min(durationMonths, item.endMonth || item.startMonth || durationMonths);
    for (let m = start; m <= end; m++) arr[m] = amount;
    return arr;
  }

  // fixed: total amount distributed evenly over the window (default whole project)
  const start = Math.max(1, item.startMonth || 1);
  const end = Math.min(durationMonths, item.endMonth || durationMonths);
  const span = Math.max(1, end - start + 1);
  const per = amount / span;
  for (let m = start; m <= end; m++) arr[m] = per;
  return arr;
}

/** Cumulative planned value up to and including currentMonth. */
export function getPlannedToDate(
  item: Pick<BudgetItem, 'plannedAmount' | 'costType' | 'startMonth' | 'endMonth' | 'month'>,
  durationMonths: number,
  currentMonth: number,
): number {
  return getPlannedInRange(item, durationMonths, 1, currentMonth);
}

/** Planned value within an inclusive [fromMonth, toMonth] window. */
export function getPlannedInRange(
  item: Pick<BudgetItem, 'plannedAmount' | 'costType' | 'startMonth' | 'endMonth' | 'month'>,
  durationMonths: number,
  fromMonth: number,
  toMonth: number,
): number {
  const dist = distributeBudgetItem(item, durationMonths);
  const from = Math.max(1, Math.min(durationMonths, fromMonth));
  const to = Math.max(0, Math.min(durationMonths, toMonth));
  let total = 0;
  for (let m = from; m <= to; m++) total += dist[m] || 0;
  return total;
}

/** Sum of actual expenses linked to this budget item, excluding outstanding advances and rejected. */
export function getActualForBudgetItem(itemId: string, expenses: Expense[]): number {
  return expenses
    .filter(e => e.budgetItemId === itemId)
    .filter(e => e.approvalStatus !== 'rejected')
    .filter(e => !e.isOutstandingAdvance)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/** Same as getActualForBudgetItem but constrained to expenses whose month falls in [from,to]. */
export function getActualInRange(
  itemId: string, expenses: Expense[], fromMonth: number, toMonth: number,
): number {
  return expenses
    .filter(e => e.budgetItemId === itemId)
    .filter(e => e.approvalStatus !== 'rejected')
    .filter(e => !e.isOutstandingAdvance)
    .filter(e => (e.month ?? 0) >= fromMonth && (e.month ?? 0) <= toMonth)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/** Return the linked expense rows for an item, sorted by date. Excludes rejected + outstanding advances. */
export function getExpensesForBudgetItem(
  itemId: string, expenses: Expense[], fromMonth?: number, toMonth?: number,
): Expense[] {
  return expenses
    .filter(e => e.budgetItemId === itemId)
    .filter(e => e.approvalStatus !== 'rejected')
    .filter(e => !e.isOutstandingAdvance)
    .filter(e => fromMonth == null || (e.month ?? 0) >= fromMonth)
    .filter(e => toMonth == null || (e.month ?? 0) <= toMonth)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function classifyVariance(variancePct: number): 'good' | 'warning' | 'critical' {
  const v = Math.abs(variancePct);
  if (v <= 0.05) return 'good';
  if (v <= 0.15) return 'warning';
  return 'critical';
}

function buildItemComparison(
  item: BudgetItem,
  expenses: Expense[],
  durationMonths: number,
  currentMonth: number,
): ItemComparison {
  // Total planned: for recurring items the stored amount is monthly — sum the distribution
  const dist = distributeBudgetItem(item, durationMonths);
  const planned = dist.reduce((s, v) => s + v, 0);
  const plannedToDate = getPlannedToDate(item, durationMonths, currentMonth);
  const actual = getActualForBudgetItem(item.id, expenses);
  const variance = actual - plannedToDate;
  const variancePct = plannedToDate > 0 ? variance / plannedToDate : (actual > 0 ? 1 : 0);
  const consumptionPct = planned > 0 ? actual / planned : 0;
  return {
    id: item.id,
    description: item.description,
    category: item.category,
    planned,
    plannedToDate,
    actual,
    variance,
    variancePct,
    consumptionPct,
    severity: classifyVariance(variancePct),
    remaining: planned - actual,
  };
}

/**
 * Group budget items by category and compute aggregated totals.
 * Returns categories sorted by total planned amount (desc).
 */
export function groupByCategory(
  budgetItems: BudgetItem[],
  expenses: Expense[],
  durationMonths: number,
  currentMonth: number,
): CategoryGroup[] {
  const map = new Map<ExpenseCategory, ItemComparison[]>();
  for (const bi of budgetItems) {
    const comp = buildItemComparison(bi, expenses, durationMonths, currentMonth);
    const arr = map.get(bi.category) || [];
    arr.push(comp);
    map.set(bi.category, arr);
  }
  const groups: CategoryGroup[] = [];
  for (const [category, items] of map.entries()) {
    const planned = items.reduce((s, i) => s + i.planned, 0);
    const plannedToDate = items.reduce((s, i) => s + i.plannedToDate, 0);
    const actual = items.reduce((s, i) => s + i.actual, 0);
    const variance = actual - plannedToDate;
    const variancePct = plannedToDate > 0 ? variance / plannedToDate : (actual > 0 ? 1 : 0);
    groups.push({
      category,
      label: EXPENSE_CATEGORY_LABELS[category] ?? String(category),
      planned,
      plannedToDate,
      actual,
      variance,
      variancePct,
      consumptionPct: planned > 0 ? actual / planned : 0,
      remaining: planned - actual,
      severity: classifyVariance(variancePct),
      items: items.sort((a, b) => b.planned - a.planned),
    });
  }
  return groups.sort((a, b) => b.planned - a.planned);
}

export function summarizeGroups(groups: CategoryGroup[]) {
  const planned = groups.reduce((s, g) => s + g.planned, 0);
  const plannedToDate = groups.reduce((s, g) => s + g.plannedToDate, 0);
  const actual = groups.reduce((s, g) => s + g.actual, 0);
  const variance = actual - plannedToDate;
  const variancePct = plannedToDate > 0 ? variance / plannedToDate : 0;
  return { planned, plannedToDate, actual, variance, variancePct, remaining: planned - actual };
}
