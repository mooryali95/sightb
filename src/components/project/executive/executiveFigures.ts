import { STATUS } from '@/lib/chart-colors';
/**
 * The executive summary's maths, kept pure: the month's performance and
 * the budget split.
 */

export interface MonthPerformance {
  planned: number;
  actual: number;
  /** planned − actual: positive is a saving, negative an overrun. */
  diff: number;
  label: string;
}

/**
 * One month's planned against spent, or the elapsed months together.
 * `selected` is 'current', 'all', or a month number as text.
 */
export function monthPerformance(
  selected: string, currentMonth: number, durationMonths: number, plannedMonthly: number[], actualMonthly: number[],
): MonthPerformance {
  if (selected === 'all') {
    // Cumulative across all elapsed months
    const elapsed = Math.min(durationMonths, currentMonth);
    let totalPlanned = 0, totalActual = 0;
    for (let i = 0; i < elapsed; i++) {
      totalPlanned += plannedMonthly[i] || 0;
      totalActual += actualMonthly[i] || 0;
    }
    return { planned: totalPlanned, actual: totalActual, diff: totalPlanned - totalActual, label: `إجمالي ${elapsed} شهر` };
  }
  const monthIdx = selected === 'current' ? currentMonth - 1 : parseInt(selected) - 1;
  const planned = plannedMonthly[monthIdx] || 0;
  const actual = actualMonthly[monthIdx] || 0;
  return { planned, actual, diff: planned - actual, label: `شهر ${monthIdx + 1}` };
}

export interface BudgetSlice { name: string; value: number; fill: string }

/**
 * توزيع الموازنة الصحيح:
 * - المصروف الفعلي (AC)
 * - الملتزم وغير المصروف = max(0, totalCommitted − totalActual)
 * - المتاح = max(0, BAC − max(totalCommitted, totalActual))
 * BAC = totalPlanned كما هو: بنود أمر التغيير المعتمد تُضاف إلى الموازنة عند
 * اعتماده فهي داخل totalPlanned أصلاً، وأثر الأمر على العقد رقم إيراد لا موازنة.
 */
export function splitBudget(totalPlanned: number, totalActual: number, totalCommitted: number): BudgetSlice[] {
  const committedRemaining = Math.max(0, totalCommitted - totalActual);
  const usedOrCommitted = Math.max(totalActual, totalCommitted);
  const trulyAvailable = Math.max(0, totalPlanned - usedOrCommitted);
  const overBudget = Math.max(0, usedOrCommitted - totalPlanned);
  return [
    { name: 'مصروف', value: totalActual, fill: STATUS.bad },
    { name: 'ملتزم غير مصروف', value: committedRemaining, fill: STATUS.watch },
    { name: 'متاح', value: trulyAvailable, fill: STATUS.good },
    { name: 'تجاوز', value: overBudget, fill: STATUS.over },
  ].filter(d => d.value > 0);
}
