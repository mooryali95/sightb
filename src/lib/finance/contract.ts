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
  const start = new Date(startDate);
  const now = new Date();
  const diff = (now.getFullYear() - start.getFullYear()) * 12
    + (now.getMonth() - start.getMonth()) + 1;
  return Math.max(1, Math.min(diff, durationMonths));
}
