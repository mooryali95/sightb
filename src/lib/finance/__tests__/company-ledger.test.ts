import { describe, it, expect } from 'vitest';
import {
  COMPANY, balanceBetween, balancesWithCompany, splitOf, statementOf, suggestAllocation,
  suggestSalaryDeduction, summarizeCompanyExpenses,
  type CompanyExpense, type ExpenseAllocation, type IntercompanyEntry, type LedgerNode,
} from '../company-ledger';

const expense = (id: string, amount: number, over: Partial<CompanyExpense> = {}): CompanyExpense => ({
  id, companyId: 'c', date: '2026-10-01', amount, description: '', kind: 'salary', partyId: null, paidByPartyId: null, ...over,
});
const alloc = (expenseId: string, projectId: string, amount: number): ExpenseAllocation => ({ id: `${expenseId}-${projectId}`, expenseId, projectId, amount });
const party = (id: string): LedgerNode => ({ kind: 'party', id });
const project = (id: string): LedgerNode => ({ kind: 'project', id });
let seq = 0;
const move = (from: LedgerNode, to: LedgerNode, amount: number, type: IntercompanyEntry['type'] = 'advance', date = '2026-10-02'): IntercompanyEntry => ({
  id: `m${++seq}`, companyId: 'c', date, amount, type, from, to, note: '', dueDate: null, salaryExpenseId: null,
});

describe('company expenses and their allocation', () => {
  it('splits an expense into what projects carry and what stays on the company', () => {
    const e = expense('e1', 10000);
    expect(splitOf(e, [alloc('e1', 'p1', 6000), alloc('e2', 'p1', 999)])).toMatchObject({ allocated: 6000, retained: 4000 });
  });

  it('totals by kind and by project, counting each riyal once', () => {
    const s = summarizeCompanyExpenses(
      [expense('e1', 10000), expense('e2', 5000, { kind: 'owner_salary' }), expense('e3', 1200.5, { kind: 'rent' })],
      [alloc('e1', 'p1', 6000), alloc('e1', 'p2', 1000), alloc('e2', 'p1', 5000), alloc('other', 'p1', 77)],
    );
    expect(s).toMatchObject({ total: 16200.5, allocated: 12000, retained: 4200.5 });
    expect(s.total).toBe(s.allocated + s.retained);
    expect(s.byProject.get('p1')).toBe(11000);
    expect(s.byKind[0]).toEqual({ kind: 'salary', total: 10000, allocated: 7000 });
    expect(s.byKind.find((k) => k.kind === 'owner_salary')).toEqual({ kind: 'owner_salary', total: 5000, allocated: 5000 });
  });

  it('suggests a split by contract value that sums to the cent', () => {
    const rows = suggestAllocation(1000, [{ id: 'big', weight: 2_000_000 }, { id: 'mid', weight: 1_000_000 }, { id: 'small', weight: 0 }]);
    expect(rows).toEqual([{ projectId: 'big', amount: 666.67 }, { projectId: 'mid', amount: 333.33 }]);
    const odd = suggestAllocation(100, [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }, { id: 'c', weight: 1 }]);
    expect(odd.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(100, 10);
    expect(suggestAllocation(90, [{ id: 'a', weight: 0 }, { id: 'b', weight: 0 }])).toEqual([{ projectId: 'a', amount: 45 }, { projectId: 'b', amount: 45 }]);
    expect(suggestAllocation(0, [{ id: 'a', weight: 1 }])).toEqual([]);
  });
});

describe('balances between the company, projects and people', () => {
  const omar = party('omar'), ayman = party('ayman'), x = project('x');

  it('nets advances and repayments in every direction against the company', () => {
    const entries = [
      move(omar, COMPANY, 12000),                // Omar lends the company
      move(COMPANY, ayman, 3000),                // the company advances Ayman
      move(ayman, COMPANY, 1000, 'repayment'),   // Ayman repays part
      move(COMPANY, x, 40000),                   // the company funds project X
      move(x, COMPANY, 15000, 'repayment'),      // X pays some back
    ];
    const b = Object.fromEntries(balancesWithCompany(entries, []).map((r) => [r.node.id, r.owesCompany]));
    expect(b).toEqual({ omar: -12000, ayman: 2000, x: 25000 });
  });

  it('counts a salary paid from a person\'s pocket as owed to them', () => {
    const paid = expense('e1', 4500, { paidByPartyId: 'omar', description: 'راتب المحاسب' });
    expect(balancesWithCompany([], [paid])).toEqual([{ node: omar, owesCompany: -4500 }]);
    expect(balanceBetween(COMPANY, omar, [], [paid])).toBe(4500);
  });

  it('keeps a direct project–person advance off the company\'s balances but in theirs', () => {
    const entries = [move(x, ayman, 800)];
    expect(balancesWithCompany(entries, [])).toEqual([]);
    expect(balanceBetween(ayman, x, entries, [])).toBe(800);
    expect(balanceBetween(x, ayman, entries, [])).toBe(-800);
  });

  it('writes a running statement, in date order', () => {
    const entries = [move(COMPANY, ayman, 3000, 'advance', '2026-10-05'), move(ayman, COMPANY, 1000, 'repayment', '2026-10-20')];
    const rows = statementOf(ayman, entries, []);
    expect(rows.map((r) => [r.date, r.inflow, r.outflow, r.balance])).toEqual([['2026-10-05', 3000, 0, 3000], ['2026-10-20', 0, 1000, 2000]]);
    expect(rows[1].label).toBe('سداد');
  });

  it('proposes deducting an open advance from the salary, never more than either', () => {
    const entries = [move(COMPANY, ayman, 3000)];
    expect(suggestSalaryDeduction('ayman', 8000, entries, [])).toBe(3000);
    expect(suggestSalaryDeduction('ayman', 2000, entries, [])).toBe(2000);
    expect(suggestSalaryDeduction('omar', 8000, [move(omar, COMPANY, 5000)], [])).toBe(0);
  });
});
