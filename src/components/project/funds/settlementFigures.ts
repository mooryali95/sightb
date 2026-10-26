import {
  getFundSpent, getFundDirectSpent, getFundCustodyDraw, getFundOutstandingAdvances, getFundCashTransfersOut,
  getFundRemaining, calculateSettlementDifference, getFundOpenItems, auditFundFinancialLinks,
  type FundOpenItems, type FundLinkViolation,
} from '@/lib/funds';
import type { CashTransfer, Custody, Expense, FundSettlement, PaymentRequest, ProjectFund } from '@/types/project';

export interface FundRows {
  expenses: Expense[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
}

export interface SpendBreakdown {
  direct: number;
  custodyDraw: number;
  advances: number;
  transfersOut: number;
}

export interface SettlementFigures {
  /** Everything documented against the fund. */
  spent: number;
  breakdown: SpendBreakdown;
  /** Received − spent − the cash typed in. */
  difference: number;
  /** What the ledger says should still be in hand, never below zero. */
  computedRemaining: number;
  openItems: FundOpenItems;
  /** Rows linked to the fund and to a custody at once; none means the fund is consistent. */
  violations: FundLinkViolation[];
}

/** The figures the settlement dialog shows for a fund, given the cash typed in. */
export function settlementFigures(fund: ProjectFund, rows: FundRows, remainingCash: number): SettlementFigures {
  const { expenses, custodies, paymentRequests, cashTransfers } = rows;
  // Paid back to the company from the fund leaves it like spend, though it is no expense.
  const spent = getFundSpent(fund.id, expenses, custodies, paymentRequests, cashTransfers) + (fund.returnedOut ?? 0);
  return {
    spent,
    breakdown: {
      direct: getFundDirectSpent(fund.id, expenses, custodies),
      custodyDraw: getFundCustodyDraw(fund.id, custodies),
      advances: getFundOutstandingAdvances(fund.id, paymentRequests),
      transfersOut: getFundCashTransfersOut(fund.id, cashTransfers),
    },
    difference: calculateSettlementDifference(fund.amount, spent, remainingCash),
    computedRemaining: Math.max(getFundRemaining(fund, expenses, custodies, paymentRequests, cashTransfers), 0),
    openItems: getFundOpenItems(fund.id, custodies, paymentRequests, cashTransfers, expenses),
    violations: auditFundFinancialLinks(fund.id, expenses, paymentRequests),
  };
}

/** A settlement can still be edited while it is a draft or was rejected; none on file counts as editable. */
export function isSettlementEditable(existing: FundSettlement | undefined): boolean {
  return !existing || existing.status === 'draft' || existing.status === 'rejected';
}

/** A difference above one unit needs a reason. */
export function needsReason(difference: number): boolean {
  return Math.abs(difference) > 1;
}
