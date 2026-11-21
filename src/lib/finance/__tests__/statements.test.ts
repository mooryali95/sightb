import { describe, it, expect } from 'vitest';
import { cashFlowStatement, chargedToProjects, companyCashCost, companyOwnCost, incomeStatement, monthsOf, obligations, partyCash, projectsCash, receivablesAging } from '../statements';
import type { IntercompanyEntry } from '../company-ledger';
import type { Commitment } from '@/types/project';
import type { Expense, Revenue } from '@/types/project';

const rev = (id: string, projectId: string, amount: number, status: Revenue['status'], over: Partial<Revenue> = {}) =>
  ({ id, projectId, amount, status, description: id, date: '2026-01-15', month: 1, revenueType: 'milestone', ...over } as Revenue);
const exp = (id: string, projectId: string, amount: number, date: string, over: Partial<Expense> = {}) =>
  ({ id, projectId, amount, date, description: id, approvalStatus: 'approved', month: 1, category: 'other', ...over } as Expense);
const Q1 = { from: '2026-01-01', to: '2026-03-31' };

const revenues = [
  rev('a1', 'A', 100000, 'collected', { invoiceDate: '2026-01-10', collectionDate: '2026-02-05' }),
  rev('a2', 'A', 40000, 'invoiced', { invoiceDate: '2026-03-01' }),
  rev('a3', 'A', 999, 'planned'),
  rev('b1', 'B', 60000, 'invoiced', { invoiceDate: '2025-12-20' }), // billed before the period
];
const expenses = [
  exp('e1', 'A', 30000, '2026-01-20'), exp('e2', 'B', 20000, '2026-02-10'),
  exp('e3', 'A', 5000, '2026-02-11', { approvalStatus: 'rejected' }), exp('e4', 'A', 7000, '2026-02-12', { isOutstandingAdvance: true }),
  exp('e5', 'B', 1000, '2026-04-02'), // after the period
];

describe('incomeStatement', () => {
  it('bills by invoice date, costs the counted expenses dated in the period, and nets the company and indirect costs', () => {
    const s = incomeStatement({ revenues, expenses, companyExpenses: [{ date: '2026-02-01', amount: 10000 }, { date: '2025-12-01', amount: 99 }], indirect: [{ date: '2026-03-31', amount: 5000 }, { date: '2026-04-01', amount: 77 }] }, Q1);
    expect(s).toEqual({ revenue: 140000, directCost: 50000, grossProfit: 90000, grossMargin: 64.29, companyCost: 10000, indirectCost: 5000, netProfit: 75000, netMargin: 53.57 });
  });

  it('adds up: the projects\' statements sum to the whole', () => {
    const of = (id: string) => incomeStatement({ revenues: revenues.filter((r) => r.projectId === id), expenses: expenses.filter((e) => e.projectId === id) }, Q1);
    const whole = incomeStatement({ revenues, expenses }, Q1);
    expect(of('A').revenue + of('B').revenue).toBe(whole.revenue);
    expect(of('A').directCost + of('B').directCost).toBe(whole.directCost);
  });

  it('gives no margin, not NaN, without revenue', () => {
    expect(incomeStatement({ revenues: [], expenses: [] }, Q1).grossMargin).toBeNull();
  });
});

describe('cashFlowStatement', () => {
  it('counts cash when it moved, month by month, and carries the balance', () => {
    const months = cashFlowStatement({ revenues, expenses, otherIn: [{ date: '2026-01-02', amount: 50000 }], opening: 1000 }, Q1);
    expect(months).toEqual([
      { month: '2026-01', inflow: 50000, outflow: 30000, net: 20000, balance: 21000 },
      // The 7,000 advance still outstanding is cash out, though not cost yet; the rejected 5,000 is neither.
      { month: '2026-02', inflow: 100000, outflow: 27000, net: 73000, balance: 94000 },
      { month: '2026-03', inflow: 0, outflow: 0, net: 0, balance: 94000 },
    ]);
  });

  it('closes: opening plus every month\'s net is the closing balance', () => {
    const m = cashFlowStatement({ revenues, expenses, opening: 500 }, Q1);
    expect(500 + m.reduce((s, x) => s + x.net, 0)).toBe(m[m.length - 1].balance);
  });

  it('counts a collection with no recorded day on the revenue\'s own date, as the dashboard does', () => {
    const undated = [rev('u', 'A', 50000, 'collected', { date: '2026-01-05', invoiceDate: '2026-01-05' })];
    expect(cashFlowStatement({ revenues: undated, expenses: [] }, Q1)[0]).toMatchObject({ month: '2026-01', inflow: 50000 });
  });

  it('spans the year end', () => {
    expect(monthsOf({ from: '2025-11-10', to: '2026-02-01' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('receivablesAging', () => {
  it('sorts what is billed and unpaid by how long it has waited', () => {
    expect(receivablesAging(revenues, '2026-03-31')).toEqual([
      { bucket: '0-30', amount: 40000, count: 1 },
      { bucket: '31-60', amount: 0, count: 0 },
      { bucket: '61-90', amount: 0, count: 0 },
      { bucket: '90+', amount: 60000, count: 1 },
    ]);
  });
});

describe('receivablesAging with a bad date', () => {
  it('does not call an invoice late because its date cannot be read, or is in the future', () => {
    const odd = [rev('nodate', 'A', 500, 'invoiced', { date: '', invoiceDate: undefined }), rev('future', 'A', 700, 'invoiced', { invoiceDate: '2026-12-25' })];
    expect(receivablesAging(odd, '2026-03-31').map((a) => a.amount)).toEqual([1200, 0, 0, 0]);
  });
});

describe('the company edge', () => {
  it('leaves out of the company cost the share a project already paid itself', () => {
    const e = { id: 'x', companyId: 'c', date: '2026-02-01', amount: 1000, description: '', kind: 'salary' as const, partyId: null, paidByPartyId: null };
    expect(companyOwnCost([e], [
      { id: '1', expenseId: 'x', projectId: 'A', amount: 300, settledInProject: true },
      { id: '2', expenseId: 'x', projectId: 'B', amount: 200 },
    ])).toEqual([{ date: '2026-02-01', amount: 700 }]);
  });

  it('never lets shares settled past the amount turn the cost negative', () => {
    const e = { id: 'x', companyId: 'c', date: '2026-02-01', amount: 1000, description: '', kind: 'salary' as const, partyId: null, paidByPartyId: null };
    expect(companyOwnCost([e], [{ id: '1', expenseId: 'x', projectId: 'A', amount: 1250, settledInProject: true }])[0].amount).toBe(0);
  });

  it('counts a bill someone paid from their pocket once: when the company repays them', () => {
    const bill = { id: 'x', companyId: 'c', date: '2026-01-10', amount: 1000, description: '', kind: 'other' as const, partyId: null, paidByPartyId: 'owner' };
    const repay = { id: 'r', companyId: 'c', date: '2026-02-10', amount: 1000, type: 'repayment', from: { kind: 'company', id: null }, to: { kind: 'party', id: 'owner' }, note: '', dueDate: null, salaryExpenseId: null } as IntercompanyEntry;
    const months = cashFlowStatement({ revenues: [], expenses: [], otherOut: [...partyCash([repay]).out, ...companyCashCost([bill], [])] }, Q1);
    expect(months.map((m) => m.outflow)).toEqual([0, 1000, 0]);
    expect(companyOwnCost([bill], [])).toEqual([{ date: '2026-01-10', amount: 1000 }]); // still cost in January
  });

  it('counts cash from and to parties, and not what moves between the company and its projects', () => {
    const mv = (from: IntercompanyEntry['from'], to: IntercompanyEntry['to'], amount: number) =>
      ({ id: `${amount}`, companyId: 'c', date: '2026-01-05', amount, type: 'advance', from, to, note: '', dueDate: null, salaryExpenseId: null }) as IntercompanyEntry;
    const C = { kind: 'company' as const, id: null }, L = { kind: 'party' as const, id: 'l' }, P = { kind: 'project' as const, id: 'A' };
    const cash = partyCash([mv(L, C, 500), mv(C, P, 400), mv(P, L, 100), mv(L, P, 50)]);
    expect(cash.in.map((x) => x.amount)).toEqual([500, 50]);
    expect(cash.out.map((x) => x.amount)).toEqual([100]);
  });

  it('sums the advances still out and the contracted work not yet paid', () => {
    const c = (totalAmount: number, spentAmount: number, status = 'active') => ({ id: `${totalAmount}`, projectId: 'A', description: '', totalAmount, spentAmount, status, createdAt: '' }) as Commitment;
    expect(obligations(expenses, [c(10000, 4000), c(500, 500), c(900, 0, 'cancelled')]))
      .toEqual({ advances: 7000, advanceCount: 1, commitments: 6000, commitmentCount: 1 });
  });
});

describe('the edge of a set of projects', () => {
  const ids = new Set(['A', 'B']);
  it('counts what the company charged them on top of their own spend, dated as the expense', () => {
    const e = { id: 'x', companyId: 'c', date: '2026-02-01', amount: 1000, description: '', kind: 'salary' as const, partyId: null, paidByPartyId: null };
    expect(chargedToProjects([e], [
      { id: '1', expenseId: 'x', projectId: 'A', amount: 300, settledInProject: true },
      { id: '2', expenseId: 'x', projectId: 'B', amount: 200 },
      { id: '3', expenseId: 'x', projectId: 'Z', amount: 100 },
    ], ids)).toEqual([{ date: '2026-02-01', amount: 200 }]);
  });

  it('counts funding in and repayments out, and not a move between two of them', () => {
    const mv = (from: IntercompanyEntry['from'], to: IntercompanyEntry['to'], amount: number) =>
      ({ id: `${amount}`, companyId: 'c', date: '2026-01-05', amount, type: 'advance', from, to, note: '', dueDate: null, salaryExpenseId: null }) as IntercompanyEntry;
    const C = { kind: 'company' as const, id: null }, pr = (id: string) => ({ kind: 'project' as const, id });
    const cash = projectsCash([mv(C, pr('A'), 500), mv(pr('A'), C, 120), mv(pr('A'), pr('B'), 40), mv(C, pr('Z'), 9)], ids);
    expect(cash.in.map((x) => x.amount)).toEqual([500]);
    expect(cash.out.map((x) => x.amount)).toEqual([120]);
  });
});
