import { describe, it, expect } from 'vitest';
import { buildUnifiedStatement, natureOf } from '../unified-statement';
import { getProjectSummary } from '../summary';
import { buildStatementWorkbook } from '@/lib/export/unified-statement';
import type { ChangeOrder, Expense, Project, Resource, Revenue } from '@/types/project';

const project = (id: string, name: string, contractValue: number): Project => ({
  id, name, contractValue, companyId: 'c', status: 'active', durationMonths: 4, createdAt: '2026-01-01',
} as unknown as Project);

let n = 0;
const expense = (projectId: string, amount: number, extra: Partial<Expense> = {}): Expense => ({
  id: `e${++n}`, projectId, category: 'salary', description: 'حافز', amount, date: `2026-0${(n % 9) + 1}-01`, month: (n % 4) + 1,
  approvalStatus: 'approved', isVatExempt: false, ...extra,
});
const revenue = (projectId: string, amount: number, status: Revenue['status']): Revenue => ({
  id: `r${++n}`, projectId, description: 'دفعة', amount, date: '2026-02-01', month: 1, revenueType: 'milestone', status,
});

const albania = project('a', 'ألبانيا', 200000);
const hackathon = project('h', 'الهاكثون', 130434.78);
const other = project('x', 'شركة أخرى', 999);
const resources: Resource[] = [{ id: 'res-omar', projectId: 'a', name: 'عمر عبدالحميد', monthlyCost: 0, createdAt: '' } as Resource];
const changeOrders: ChangeOrder[] = [{ id: 'co', projectId: 'h', amount: 0 } as unknown as ChangeOrder];

const expenses: Expense[] = [
  expense('a', 10000, { resourceId: 'res-omar' }),
  expense('a', 13000, { sourcePaymentRequestId: 'pr1', partyId: 'p-ahmad' }),
  expense('a', 3289, { reimbursesPayableId: 'vp1', vendor: 'د صالح', category: 'other' }),
  expense('a', 5000, { isOutstandingAdvance: true }),
  expense('a', 7000, { approvalStatus: 'rejected' }),
  expense('h', 18000, { category: 'hospitality', description: 'قاعة لعمر', approvalStatus: 'pending' }),
  expense('x', 1, {}),
];
const revenues: Revenue[] = [revenue('a', 80000, 'collected'), revenue('a', 60000, 'invoiced'), revenue('h', 65217.391, 'collected')];

const statement = buildUnifiedStatement({
  companyName: 'منظومة', projects: [albania, hackathon], expenses, revenues, changeOrders, resources,
  parties: [{ id: 'p-ahmad', name: 'أحمد صبري (أبو رؤى)' }],
});

describe('buildUnifiedStatement', () => {
  it('gives each project the same contract, collected and actual as the project summary', () => {
    for (const p of [albania, hackathon]) {
      const s = getProjectSummary(p, [], expenses.filter((e) => e.projectId === p.id), revenues.filter((r) => r.projectId === p.id), changeOrders.filter((o) => o.projectId === p.id));
      const f = statement.projects.find((x) => x.id === p.id)!.figures;
      expect(f.contract).toBeCloseTo(s.effectiveContractValue, 2);
      expect(f.collected).toBeCloseTo(s.collectedRevenue, 2);
      expect(f.actual).toBeCloseTo(s.totalActual, 2);
    }
  });

  it('leaves out rejected expenses and open advances, and lists the advances beside the figures', () => {
    const a = statement.projects[0].figures;
    expect(a.actual).toBe(10000 + 13000 + 3289);
    expect(a.openAdvances).toBe(5000);
    expect(a.movements).toBe(3);
    expect(a.net).toBe(80000 - 26289);
    expect(a.margin).toBeCloseTo((80000 - 26289) / 80000, 6);
  });

  it('adds the projects up, and only the projects asked for', () => {
    expect(statement.figures.actual).toBe(26289 + 18000);
    expect(statement.figures.collected).toBe(145217.39); // rounded to the halala
    expect(statement.figures.contract).toBeCloseTo(330434.78, 2);
    expect(statement.lines.every((l) => l.projectId !== 'x')).toBe(true);
    expect(statement.lines.reduce((s, l) => s + l.amount, 0)).toBe(statement.figures.actual);
  });

  it('names who the money went to: registry, then linked or named resource, then the vendor text', () => {
    const party = (amount: number) => statement.lines.find((l) => l.amount === amount)!.party;
    expect(party(13000)).toBe('أحمد صبري (أبو رؤى)');
    expect(party(10000)).toBe('عمر عبدالحميد');
    expect(party(18000)).toBe('عمر عبدالحميد');
    expect(party(3289)).toBe('د صالح');
  });

  it('shares by party and nature add to the actual spend, largest first', () => {
    const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
    expect(sum(statement.byParty)).toBe(statement.figures.actual);
    expect(sum(statement.byNature)).toBe(statement.figures.actual);
    expect(statement.byParty[0]).toMatchObject({ label: 'عمر عبدالحميد', amount: 28000, count: 2 });
    expect(statement.byParty.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9);
  });

  it('lists what was collected, not what was only invoiced', () => {
    expect(statement.collections.map((c) => c.amount)).toEqual([80000, 65217.391]);
  });
});

describe('natureOf', () => {
  it('reads how a movement arose before what it bought', () => {
    expect(natureOf({ category: 'salary', sourcePaymentRequestId: 'x' })).toBe('تسوية سلفة');
    expect(natureOf({ category: 'other', reimbursesPayableId: 'x' })).toBe('سداد ذمة');
    expect(natureOf({ category: 'travel' })).toBe('سفر وإقامة');
    expect(natureOf({ category: 'salary', isOutstandingAdvance: true })).toBe('سلفة قائمة');
  });
});

describe('buildStatementWorkbook', () => {
  const wb = buildStatementWorkbook(statement, new Date('2026-11-04T00:00:00Z'));
  const cells = (name: string) => wb.sheets.find((s) => s.name === name)!.grid!.flat().map((c) => (c && typeof c === 'object' ? c.value : c));

  it('lays out the combined sheet, a sheet per project, the movements and the collections', () => {
    expect(wb.sheets.map((s) => s.name)).toEqual(['منظومة — المجمّع', 'ألبانيا', 'الهاكثون', 'مصدر_الحقيقة', 'التحصيل']);
  });

  it('puts the same figures in the combined sheet and in the movements total', () => {
    const combined = cells('منظومة — المجمّع');
    expect(combined).toContain('مقارنة المشاريع');
    expect(combined).toContain(statement.figures.actual);
    expect(combined).toContain(statement.figures.net);
    const source = cells('مصدر_الحقيقة');
    expect(source.filter((v) => typeof v === 'number' && v > 100).slice(-1)[0]).toBe(statement.figures.actual);
  });
});
