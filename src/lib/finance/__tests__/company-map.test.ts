import { describe, it, expect } from 'vitest';
import { buildCompanyMap, healthOf, type MapProjectInput } from '../company-map';
import type { CompanyExpense, ExpenseAllocation, IntercompanyEntry } from '../company-ledger';

const p = (id: string, over: Partial<MapProjectInput> = {}): MapProjectInput => ({
  id, name: id, group: 'مستقلة', status: 'active', contract: 100000, planned: 80000, actual: 20000, collected: 0, ...over,
});
const move = (id: string, from: IntercompanyEntry['from'], to: IntercompanyEntry['to'], amount: number, type: IntercompanyEntry['type'] = 'advance'): IntercompanyEntry => ({
  id, companyId: 'c', date: '2026-10-01', amount, type, from, to, note: '', dueDate: null, salaryExpenseId: null,
});
const C = { kind: 'company' as const, id: null };
const P = (id: string) => ({ kind: 'project' as const, id });
const exp = (id: string, amount: number): CompanyExpense => ({ id, companyId: 'c', date: '2026-10-01', amount, description: '', kind: 'salary', partyId: null, paidByPartyId: null });
const alloc = (expenseId: string, projectId: string, amount: number): ExpenseAllocation => ({ id: `${expenseId}${projectId}`, expenseId, projectId, amount });

describe('healthOf', () => {
  it('reads a project with one symbol: on track, needs attention, over budget, or idle', () => {
    expect(healthOf(p('a'))).toBe('good');
    expect(healthOf(p('a', { actual: 75000 }))).toBe('warn');          // past 90%
    expect(healthOf(p('a', { planned: 120000 }))).toBe('warn');        // planned loss
    expect(healthOf(p('a', { status: 'on-hold' }))).toBe('warn');
    expect(healthOf(p('a', { actual: 90000 }))).toBe('bad');           // past the budget
    expect(healthOf(p('a', { status: 'completed', actual: 90000 }))).toBe('idle');
    expect(healthOf(p('a', { planned: 0, actual: 0 }))).toBe('idle');
    expect(healthOf(p('a', { status: 'on-hold', planned: 0, actual: 0 }))).toBe('warn');
  });
});

describe('buildCompanyMap', () => {
  const ledger = {
    entries: [move('f1', C, P('x'), 40000), move('r1', P('x'), C, 15000, 'repayment'), move('f2', C, P('y'), 10000)],
    expenses: [exp('e1', 10000), exp('e2', 3000)],
    allocations: [alloc('e1', 'x', 6000)],
  };
  const map = buildCompanyMap([p('x', { group: 'السكني' }), p('y', { group: 'السكني' }), p('z')], ledger);

  it('puts each project\'s flows with the company on its strip', () => {
    const x = map.projects.find((q) => q.id === 'x')!;
    expect(x).toMatchObject({ funded: 40000, charged: 6000, returned: 15000, owes: 25000, spendPct: 25 });
    expect(x.outScale).toBe(1);                           // the largest flow on the map
    expect(map.projects.find((q) => q.id === 'y')!.outScale).toBe(0.22); // 10,000 of 46,000
    expect(map.projects.find((q) => q.id === 'z')).toMatchObject({ funded: 0, charged: 0, owes: 0, outScale: 0 });
  });

  it('says what belongs to the company, to both, and to the project, without counting anything twice', () => {
    expect(map.company).toMatchObject({ ownSpend: 13000, charged: 6000, retained: 7000, fundedOut: 50000, returned: 15000, owedToCompany: 35000 });
    expect(map.split).toEqual({ companyOnly: 7000, between: 56000, projectOnly: 60000 });
    expect(map.company.charged + map.company.retained).toBe(map.company.ownSpend);
  });

  it('groups projects by portfolio in the order they come', () => {
    expect(map.groups.map((g) => [g.name, g.projects.length])).toEqual([['السكني', 2], ['مستقلة', 1]]);
  });

  it('still draws the projects when the ledger is not live', () => {
    const bare = buildCompanyMap([p('x')], null);
    expect(bare.projects[0]).toMatchObject({ funded: 0, charged: 0, returned: 0, owes: 0 });
    expect(bare.split).toEqual({ companyOnly: 0, between: 0, projectOnly: 20000 });
  });
});
