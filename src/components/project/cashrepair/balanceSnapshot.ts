import type { CashRepairBalanceSnapshot } from '@/lib/cash-repair-events';
import { getProjectFundsSummary, getFundRemaining, getCustodyBreakdown } from '@/lib/funds';
import type { AppState } from '@/store/useStore';

export type BalanceState = Pick<
  AppState,
  'expenses' | 'custodies' | 'paymentRequests' | 'cashTransfers' | 'projectFunds' | 'fundSettlements'
>;

/** لقطة أرصدة محسوبة من حالة المتجر (نفس معادلات FundsSection). */
export function balanceSnapshot(s: BalanceState, projectId: string, custodyId: string): CashRepairBalanceSnapshot {
  const expenses = (s.expenses || []).filter((e) => e.projectId === projectId);
  const custodies = (s.custodies || []).filter((c) => c.projectId === projectId);
  const prs = (s.paymentRequests || []).filter((p) => p.projectId === projectId);
  const transfers = (s.cashTransfers || []).filter((t) => t.projectId === projectId);
  const summary = getProjectFundsSummary(
    projectId, s.projectFunds || [], s.fundSettlements || [], expenses, custodies, prs, transfers,
  );
  const activeFundRemaining = summary.activeFund
    ? getFundRemaining(summary.activeFund, expenses, custodies, prs, transfers)
    : 0;
  const custody = custodies.find((c) => c.id === custodyId);
  const bd = custody ? getCustodyBreakdown(custody, expenses, transfers, prs) : null;
  return {
    activeFundRemaining,
    managerRemaining: summary.remainingInManagerHand,
    custodyAvailable: bd?.availableAmount ?? 0,
    custodySpent: bd?.spent ?? 0,
    custodyRemaining: bd?.remaining ?? 0,
  };
}
