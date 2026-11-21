import { describe, it, expect } from 'vitest';
import { buildCompanyMap, healthOf, projectFlows, type MapProjectInput } from '../company-map';
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
    expect(healthOf(p('a', { planned: 0, actual: 250000 }))).toBe('warn');  // spending with no budget is not "on track"
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
    expect(map.company).toMatchObject({ ownSpend: 13000, charged: 6000, retained: 7000, fundedOut: 50000, returned: 15000, owedToCompany: 35000, owedByProjects: 35000 });
    expect(map.split).toEqual({ companyOnly: 7000, between: 6000, projectOnly: 60000 });
    expect(map.company.charged + map.company.retained).toBe(map.company.ownSpend);
  });

  it('sums the flows of the projects it is handed, so a filtered list gives the filtered flows', () => {
    expect(projectFlows(map.projects)).toEqual({ sent: 56000, returned: 15000, owed: 35000 });
    expect(projectFlows(map.projects.filter((q) => q.id === 'y'))).toEqual({ sent: 10000, returned: 0, owed: 10000 });
    expect(projectFlows([])).toEqual({ sent: 0, returned: 0, owed: 0 });
    // A project the company owes does not cancel what another owes it.
    expect(projectFlows([map.projects[0], { ...map.projects[1], owes: -4000 }]).owed).toBe(25000);
  });

  it('gives each group its portfolio and its own flows, and the largest flow on any line', () => {
    const withIds = buildCompanyMap([p('x', { group: 'السكني', groupId: 'pf-1' }), p('y', { group: 'السكني', groupId: 'pf-1' }), p('z')], ledger);
    expect(withIds.groups.map((g) => [g.name, g.id, g.sent, g.returned])).toEqual([['السكني', 'pf-1', 56000, 15000], ['مستقلة', null, 0, 0]]);
    expect(withIds.projects.map((q) => q.sent)).toEqual([46000, 10000, 0]);
    expect(withIds.flowMax).toBe(56000);
    expect(buildCompanyMap([p('x')], null).flowMax).toBe(1); // never zero: it is divided by
  });

  it('counts each riyal spent once: funding is a transfer, and a share the project paid itself is not added again', () => {
    // The company funds A with 100,000 and A spends exactly that: 100,000 of real money, not 200,000.
    const funded = buildCompanyMap([p('A', { actual: 100000 })], { entries: [move('f', C, P('A'), 100000)], expenses: [], allocations: [] });
    expect(funded.split).toEqual({ companyOnly: 0, between: 0, projectOnly: 100000 });
    // A 1,000 company bill, 300 charged to A and paid by A from its own 20,000 spend: 1,000 + 20,000 − 300.
    const settled = buildCompanyMap([p('A')], { entries: [], expenses: [exp('e', 1000)], allocations: [{ ...alloc('e', 'A', 300), settledInProject: true }] });
    expect(settled.split).toEqual({ companyOnly: 700, between: 300, projectOnly: 19700 });
    expect(settled.split.companyOnly + settled.split.between + settled.split.projectOnly).toBe(1000 + 20000 - 300);
  });

  it('keeps the company\'s own figures whole when the finished projects are hidden', () => {
    const done = p('done', { status: 'completed', actual: 9000 });
    const books = { entries: [move('f', C, P('done'), 50000)], expenses: [exp('e', 9000)], allocations: [alloc('e', 'done', 9000)] };
    const view = buildCompanyMap([p('live')], books, [p('live'), done]);
    expect(view.projects.map((q) => q.id)).toEqual(['live']);
    expect(view.company).toMatchObject({ fundedOut: 50000, charged: 9000, owedToCompany: 50000, owedByProjects: 50000 });
    expect(view.split.projectOnly).toBe(29000);            // both projects' spend
  });

  it('keeps two portfolios of one name apart, each with its own link and its own flows', () => {
    const twins = buildCompanyMap([p('x', { group: 'عام', groupId: 'pf-1' }), p('y', { group: 'عام', groupId: 'pf-2' })], ledger);
    expect(twins.groups.map((g) => [g.name, g.id, g.projects.map((q) => q.id), g.sent])).toEqual([['عام', 'pf-1', ['x'], 46000], ['عام', 'pf-2', ['y'], 10000]]);
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
