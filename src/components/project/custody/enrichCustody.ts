/**
 * A custody with every figure the section shows about it, computed once from
 * lib/funds so the row, the header and the inspector cannot disagree.
 */
import { getCustodyBreakdown, getCustodyTransferSources } from '@/lib/funds';
import type { CashTransfer, Custody, Expense, PaymentRequest, ProjectFund } from '@/types/project';

export type EnrichedCustody = ReturnType<typeof enrichCustody>;

export function enrichCustody(
  c: Custody,
  expenses: Expense[],
  projTransfers: CashTransfer[],
  projPRs: PaymentRequest[],
  projectFunds: ProjectFund[],
) {
  const bd = getCustodyBreakdown(c, expenses, projTransfers, projPRs);
  const transferSources = getCustodyTransferSources(c.id, projTransfers, projectFunds);
  return {
    ...c,
    breakdown: bd,
    transferSources,
    orphanTransfers: transferSources.filter((t) => t.orphan),
    // Closed by hand, or exhausted: either way nothing more can be spent.
    isClosed: c.status === 'closed' || bd.remaining <= 0,
    spent: bd.spent,
    transfersIn: bd.transfersIn,
    outstandingAdvances: bd.outstandingAdvances,
    effectiveAmount: bd.availableAmount,
    remaining: bd.remaining,
    spendPercent: bd.spendPercent,
  };
}
