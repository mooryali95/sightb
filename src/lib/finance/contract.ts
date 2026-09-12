import { ChangeOrder } from '@/types/project';

/**
 * Calculate the effective contract value after approved change orders
 */
export function getEffectiveContractValue(contractValue: number, changeOrders: ChangeOrder[]): number {
  const approvedImpact = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + co.amountImpact, 0);
  return contractValue + approvedImpact;
}

/**
 * Get the current month of the project based on startDate
 */
export function getCurrentMonth(startDate: string, durationMonths: number): number {
  if (!startDate) return Math.ceil(durationMonths / 2);
  return getProjectMonth(startDate, new Date(), durationMonths);
}

/**
 * The project's month a calendar date falls in: 1 for the month the project
 * started, 2 for the next, clamped to 1..durationMonths. This is the month
 * every monthly figure in the app buckets by, so anything that writes an
 * expense from a date must use it rather than the calendar month.
 */
export function getProjectMonth(startDate: string, date: string | Date, durationMonths: number): number {
  const start = new Date(startDate);
  const when = typeof date === 'string' ? new Date(date) : date;
  const diff = (when.getFullYear() - start.getFullYear()) * 12
    + (when.getMonth() - start.getMonth()) + 1;
  return Math.max(1, Math.min(diff, durationMonths));
}
