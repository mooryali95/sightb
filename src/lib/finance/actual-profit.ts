/**
 * Actual profit: what was collected less what was actually spent (the
 * counted expenses: no rejected rows, no advance still outstanding), and
 * its margin as a share of what was collected. The same rule as
 * realizedProfit in getProjectSummary, for any level that has the two sums.
 *
 * Planned profit (contract less budget) says what a project should earn;
 * this says what it has earned so far. Before anything is collected the
 * margin has no base and reads 0, while the spend still shows as a loss.
 */
export function actualProfit(collected: number, actual: number): { profit: number; margin: number } {
  const profit = collected - actual;
  return { profit, margin: collected > 0 ? (profit / collected) * 100 : 0 };
}
