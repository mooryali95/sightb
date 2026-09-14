/**
 * The what-if maths, kept pure: the project as it stands, the four deltas,
 * and the scenario they produce.
 */
export interface WhatIfBase {
  contractValue: number;
  totalPlanned: number;
  totalActual: number;
  totalRevenue: number;
  durationMonths: number;
  percentComplete: number;
}

export interface WhatIfDeltas {
  /** Percent. */
  contract: number;
  /** Percent, applied to the spend and to the plan alike. */
  expense: number;
  /** Months. */
  duration: number;
  /** Percent. */
  revenue: number;
}

export const NO_DELTAS: WhatIfDeltas = { contract: 0, expense: 0, duration: 0, revenue: 0 };

export function hasChanges(d: WhatIfDeltas): boolean {
  return d.contract !== 0 || d.expense !== 0 || d.duration !== 0 || d.revenue !== 0;
}

export function whatIfScenario(base: WhatIfBase, d: WhatIfDeltas) {
  const { contractValue, totalPlanned, totalActual, totalRevenue, durationMonths, percentComplete } = base;
  const newContract = contractValue * (1 + d.contract / 100);
  const newExpenses = totalActual * (1 + d.expense / 100);
  const projectedTotal = totalPlanned * (1 + d.expense / 100);
  const newDuration = Math.max(1, durationMonths + d.duration);
  const newRevenue = totalRevenue * (1 + d.revenue / 100);

  const plannedProfit = newContract - projectedTotal;
  const plannedMargin = newContract > 0 ? (plannedProfit / newContract) * 100 : 0;
  const realizedProfit = newRevenue - newExpenses;
  const budgetRemaining = projectedTotal - newExpenses;
  const monthlyBurnRate = newDuration > 0 ? projectedTotal / newDuration : 0;
  const monthsRemaining = monthlyBurnRate > 0 ? budgetRemaining / monthlyBurnRate : 0;

  // EVM — BAC هو الموازنة الأصلية (لا تتأثر بسلايدر المصروفات حتى يبقى CPI ذا معنى)
  const bac = totalPlanned;
  const ev = bac * (percentComplete / 100);
  const cpi = newExpenses > 0 ? ev / newExpenses : 1;
  const eac = cpi > 0 ? projectedTotal / cpi : projectedTotal;

  return {
    newContract, newExpenses, projectedTotal, newDuration, newRevenue,
    plannedProfit, plannedMargin, realizedProfit, budgetRemaining,
    monthlyBurnRate, monthsRemaining, cpi, eac,
    /** Against the project as it stands. */
    profitDiff: plannedProfit - (contractValue - totalPlanned),
  };
}

export type WhatIfResult = ReturnType<typeof whatIfScenario>;
