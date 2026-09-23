/**
 * The contract's remainder is what the client has not been invoiced for:
 * the contract less the collected and the invoiced. The header card labels
 * it "not yet invoiced" and the executive summary's collection line
 * divides the contract the same way; spend has no part in it.
 */
import { describe, it, expect } from 'vitest';
import { getProjectSummary } from '@/lib/finance';
import type { Expense, Project, Revenue } from '@/types/project';

const project = {
  id: 'p', companyId: 'c', name: 'p', contractValue: 1000000, currency: 'SAR', startDate: '2026-01-01', endDate: '2026-12-31',
  durationMonths: 12, resourceCount: 1, status: 'active', createdAt: '2026-01-01', percentComplete: 40, contractType: 'lump_sum',
  retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
} as unknown as Project;
const expense = { id: 'e', projectId: 'p', category: 'other', description: '', amount: 12000, date: '2026-03-01', month: 3, approvalStatus: 'approved', isVatExempt: false } as Expense;
const revenue = (id: string, amount: number, status: Revenue['status']): Revenue =>
  ({ id, projectId: 'p', description: id, amount, date: '2026-04-01', month: 4, revenueType: 'milestone', status } as Revenue);

describe('contractRemaining', () => {
  it('is the whole contract with nothing collected or invoiced, whatever was spent', () => {
    expect(getProjectSummary(project, [], [expense], [], []).contractRemaining).toBe(1000000);
  });

  it('takes off the collected and the invoiced, not the planned, and follows the change orders', () => {
    const revenues = [revenue('c', 200000, 'collected'), revenue('i', 150000, 'invoiced'), revenue('p', 80000, 'planned')];
    const summary = getProjectSummary(project, [], [expense], revenues, [
      { id: 'co', projectId: 'p', description: '', changeType: 'scope_addition', amountImpact: 50000, durationImpact: 0, status: 'approved', requestedBy: '', createdAt: '' } as never,
    ]);
    expect(summary.effectiveContractValue).toBe(1050000);
    expect(summary.contractRemaining).toBe(700000);
  });
});
