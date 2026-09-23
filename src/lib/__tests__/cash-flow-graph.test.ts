/**
 * The cash flow graph the Sankey draws. It must stay acyclic, since one
 * link back into a fund leaves every node's position NaN, and it must
 * count each riyal once: the expense an outstanding advance created is
 * the advance already drawn.
 */
import { describe, it, expect } from 'vitest';
import { buildCashFlowGraph, type CashFlowGraph } from '@/lib/cash-flow-graph';
import type { CashTransfer, Custody, Expense, PaymentRequest, ProjectFund, Resource } from '@/types/project';

const fund = { id: 'f1', projectId: 'p', fundNumber: 1, amount: 50000, transferDate: '2026-02-01', status: 'acknowledged', createdBy: 'u', createdAt: '', updatedAt: '' } as ProjectFund;
const custody = { id: 'cu-1', projectId: 'p', resourceName: 'عهدة سامي', amount: 8000, spent: 0, remaining: 8000, createdAt: '', status: 'active', sourceFundId: 'f1' } as Custody;
const resource = { id: 'r1', projectId: 'p', name: 'سارة', monthlyCost: 9000, createdAt: '' } as Resource;
const transfer = { id: 'ct-1', projectId: 'p', fromFundId: 'f1', toCustodyId: 'cu-1', amount: 1000, transferDate: '2026-02-15', createdAt: '' } as CashTransfer;
const expense = (over: Partial<Expense>): Expense =>
  ({ id: 'e', projectId: 'p', category: 'transport', description: '', amount: 0, date: '2026-02-12', month: 2, approvalStatus: 'approved', isVatExempt: true, ...over }) as Expense;
const advance = (over: Partial<PaymentRequest> = {}): PaymentRequest =>
  ({ id: 'pr-1', projectId: 'p', resourceId: 'r1', requestType: 'advance', amount: 10000, status: 'paid', paidFromFundId: 'f1', isAdvanceOutstanding: true, autoCreatedExpenseId: 'ex-pr', refundedAmount: 0, ...over }) as PaymentRequest;

/** Depth-first search for a link that returns to a node still on the current path. */
function hasCycle(g: CashFlowGraph): boolean {
  const state = new Map<number, 'open' | 'done'>();
  const visit = (n: number): boolean => {
    if (state.get(n) === 'open') return true;
    if (state.get(n) === 'done') return false;
    state.set(n, 'open');
    const found = g.links.filter((l) => l.source === n).some((l) => visit(l.target));
    state.set(n, 'done');
    return found;
  };
  return g.nodes.some((_, i) => visit(i));
}
const named = (g: CashFlowGraph | null) => (g?.links ?? []).map((l) => `${g!.nodes[l.source].name} → ${g!.nodes[l.target].name} : ${l.value}`);
const build = (over: Partial<Parameters<typeof buildCashFlowGraph>[0]> = {}) => buildCashFlowGraph({
  projectId: 'p', funds: [fund], custodies: [custody], resources: [resource], cashTransfers: [transfer],
  paymentRequests: [advance({ refundedAmount: 2000, refundToFundId: 'f1' })],
  expenses: [
    expense({ id: 'ex-cu', amount: 3000, custodyId: 'cu-1' }),
    expense({ id: 'ex-pr', amount: 10000, fundId: 'f1', isOutstandingAdvance: true }),
    expense({ id: 'ex-direct', category: 'materials', amount: 12000, fundId: 'f1' }),
    expense({ id: 'ex-rej', category: 'food', amount: 9000, fundId: 'f1', approvalStatus: 'rejected' }),
  ],
  ...over,
});

describe('buildCashFlowGraph', () => {
  it('draws each riyal once, and a refund into its own node rather than back into the fund', () => {
    const g = build();
    expect(named(g)).toEqual([
      'دفعة 1 → عهدة: عهدة سامي : 8000',
      'دفعة 1 → عهدة: عهدة سامي : 1000',
      'دفعة 1 → سلفة: سارة : 10000',
      'سلفة: سارة → مرتجع إلى دفعة 1 : 2000',
      'دفعة 1 → مصروف: materials : 12000',
      'عهدة: عهدة سامي → مصروف: transport : 3000',
    ]);
    expect(hasCycle(g!)).toBe(false);
    expect(g!.nodes.map((n) => n.name)).not.toContain('مصروف: food');
  });

  it('draws the expense of a settled advance as a direct expense, since no advance is drawn for it', () => {
    const g = build({
      paymentRequests: [advance({ isAdvanceOutstanding: false })],
      expenses: [expense({ id: 'ex-pr', amount: 10000, fundId: 'f1' })],
    });
    expect(named(g)).toEqual(['دفعة 1 → عهدة: عهدة سامي : 8000', 'دفعة 1 → عهدة: عهدة سامي : 1000', 'دفعة 1 → مصروف: transport : 10000']);
  });

  it('is empty with nothing moved, and a refund to a custody lands in its own node too', () => {
    expect(build({ custodies: [], cashTransfers: [], paymentRequests: [], expenses: [] })).toBeNull();
    const g = build({ paymentRequests: [advance({ refundedAmount: 500, refundToCustodyId: 'cu-1' })], expenses: [] });
    expect(named(g)).toContain('سلفة: سارة → مرتجع إلى عهدة: عهدة سامي : 500');
  });
});
