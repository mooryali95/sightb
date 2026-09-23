import type { Expense } from '@/types/project';
import { getMonthlyBreakdown } from './budget';

export interface TrendRow {
  month: string;
  'الفعلي': number;
  'معدل الحرق': number;
  'المتوسط المخطط': number;
}

/**
 * The spend trend: each month's counted spend, the average burn rate over
 * the months so far, and the plan's monthly average. The spend is the same
 * monthly figure the bars and the variance table read, so a rejected
 * expense or an advance still outstanding moves none of the three charts.
 */
export function getSpendTrend(expenses: Expense[], totalPlanned: number, durationMonths: number): TrendRow[] {
  if (expenses.length === 0 || durationMonths <= 0) return [];
  const monthlyActual = getMonthlyBreakdown(expenses, durationMonths);
  const monthlyAvgPlanned = totalPlanned / durationMonths;
  let cumActual = 0;
  return Array.from({ length: durationMonths }, (_, i) => {
    cumActual += monthlyActual[i];
    return {
      month: `شهر ${i + 1}`,
      'الفعلي': monthlyActual[i],
      'معدل الحرق': Math.round(cumActual / (i + 1)),
      'المتوسط المخطط': Math.round(monthlyAvgPlanned),
    };
  });
}
