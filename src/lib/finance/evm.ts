import { BaselineItem, Expense, EVMMetrics } from '@/types/project';
import { getBaselineMonthlyPV, getMonthlyBreakdown } from './budget';

/**
 * Calculate EVM metrics given baseline, expenses, and current month.
 * Uses independent percentComplete (from milestones) instead of AC/BAC ratio.
 *
 * BAC is the baseline total. The management reserve sits outside the
 * baseline (PMI): it is its own project field, not a budget line, so taking
 * it away from the baseline as well understated BAC by the whole reserve and
 * with it EV, CPI, EAC and TCPI. It enters BAC only when an approved change
 * order moves part of it into the plan. Decided by the owner on 24 September.
 */
export function calculateEVM(
  baselineItems: BaselineItem[],
  expenses: Expense[],
  durationMonths: number,
  currentMonth: number,
  percentComplete: number = 0,
): EVMMetrics {
  const monthlyPV = getBaselineMonthlyPV(baselineItems, durationMonths);
  const monthlyAC = getMonthlyBreakdown(expenses, durationMonths);

  const bac = monthlyPV.reduce((s, v) => s + v, 0);

  const pv = monthlyPV.slice(0, currentMonth).reduce((s, v) => s + v, 0);
  const ac = monthlyAC.slice(0, currentMonth).reduce((s, v) => s + v, 0);

  // EV = % of work completed × BAC (independent from spending)
  const ev = (percentComplete / 100) * bac;

  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : (ev === 0 ? 1 : 0);
  const spi = pv > 0 ? ev / pv : (ev === 0 ? 1 : 0);

  // EAC variants
  const eacTypical = cpi > 0 ? bac / cpi : bac;
  const eacAtypical = ac + (bac - ev);
  const eacCombined = cpi > 0 && spi > 0 ? ac + ((bac - ev) / (cpi * spi)) : bac;

  const eac = eacTypical;
  const etc = eac - ac;
  const vac = bac - eac;

  const tcpiBAC = (bac - ac) !== 0 ? (bac - ev) / (bac - ac) : 0;
  const tcpiEAC = (eac - ac) !== 0 ? (bac - ev) / (eac - ac) : 0;

  return { pv, ev, ac, bac, cv, sv, cpi, spi, eac, etc, vac, tcpiBAC, tcpiEAC, eacAtypical, eacCombined };
}
