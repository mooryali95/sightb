import { describe, it, expect, beforeEach } from 'vitest';
import { buildSpendTree, buildSpendTreeCSV, buildSpendReport, buildSpendReportCSV } from '@/lib/expense-analytics';
import { buildSpendConsistency } from '@/lib/spend-consistency';
import { saveSpendTemplate, listSpendTemplates, deleteSpendTemplate } from '@/lib/spend-templates';
import type { Expense, Resource } from '@/types/project';

/**
 * Fixtures carry only the fields under test. Typing them through this helper
 * keeps `any` out while still allowing partial rows — a renamed field on the
 * real type surfaces here as a compile error.
 */
const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const one = <T,>(row: Partial<T>): T => row as T;


const resources = fixture<Resource>([
  { id: 'r1', projectId: 'p1', name: 'أيمن أصلان', monthlyCost: 0 },
  { id: 'r2', projectId: 'p1', name: 'أحمد صبري', monthlyCost: 0 },
]);

const expenses = fixture<Expense>([
  { id: 'e1', projectId: 'p1', resourceId: 'r1', custodyId: 'c1', category: 'salary', description: 'راتب', amount: 10000, date: '2026-01-05', month: 1, approvalStatus: 'approved' },
  { id: 'e2', projectId: 'p1', resourceId: 'r1', custodyId: 'c1', category: 'other', description: 'مواصلات', amount: 2000, date: '2026-02-10', month: 2, approvalStatus: 'pending' },
  { id: 'e3', projectId: 'p1', resourceId: 'r2', fundId: 'f1', category: 'salary', description: 'راتب', amount: 23000, date: '2026-01-05', month: 1, approvalStatus: 'approved' },
  { id: 'e4', projectId: 'p1', category: 'other', description: 'قرطاسية', amount: 500, date: '2026-03-01', month: 3, approvalStatus: 'approved' },
]);

describe('buildSpendTree', () => {
  it('nests resource → category and keeps totals consistent', () => {
    const tree = buildSpendTree(expenses, ['resource', 'category'], {}, { resources });
    expect(tree.grandTotal).toBe(35500);
    const ayman = tree.nodes.find((n) => n.label === 'أيمن أصلان')!;
    expect(ayman.total).toBe(12000);
    expect(ayman.children.map((c) => c.total)).toEqual([10000, 2000]);
    expect(ayman.children[0].path).toEqual(['r1', 'salary']);
  });

  it('leaf nodes carry the underlying expenses for drill-down', () => {
    const tree = buildSpendTree(expenses, ['resource', 'category', 'budgetItem'], {}, { resources });
    const leaf = tree.nodes[0].children[0].children[0];
    expect(leaf.expenses.length).toBeGreaterThan(0);
    expect(leaf.path).toHaveLength(3);
  });

  it('respects filters and sorting in both tree and CSV', () => {
    const filters = { dateFrom: '2026-01-01', dateTo: '2026-01-31' };
    const tree = buildSpendTree(expenses, ['resource'], filters, { resources }, { key: 'label', dir: 'asc' });
    expect(tree.grandTotal).toBe(33000);
    const csv = buildSpendTreeCSV(tree, 'مشروع', { filters, sort: { key: 'label', dir: 'asc' }, dimensionPath: ['resource'] });
    expect(csv).toContain('2026-01-01');
    expect(csv).toContain('الفلاتر المطبّقة');
    expect(csv).toContain('الإجمالي العام');
  });
});

describe('buildSpendConsistency', () => {
  it('is clean when there are no repairs and every expense has a source', () => {
    const rep = buildSpendConsistency(expenses.slice(0, 3), [], 'resource', { resources });
    expect(rep.totalGap).toBeCloseTo(0);
    expect(rep.hasIssues).toBe(false);
  });

  it('flags unlinked expenses (no fund and no custody)', () => {
    const rep = buildSpendConsistency(expenses, [], 'resource', { resources });
    expect(rep.totalUnlinked).toBe(500);
    expect(rep.hasIssues).toBe(true);
  });

  it('spreads repair amounts over the custody expenses to rebuild the "before" figures', () => {
    const rep = buildSpendConsistency(expenses, [{ id: 'x', custodyId: 'c1', amount: 1200 }], 'resource', { resources });
    const ayman = rep.rows.find((r) => r.label === 'أيمن أصلان')!;
    expect(ayman.after).toBe(12000);
    expect(ayman.before).toBeCloseTo(13200);
    expect(rep.totalGap).toBeCloseTo(1200);
  });

  it('groups by category too', () => {
    const rep = buildSpendConsistency(expenses, [], 'category', { resources });
    expect(rep.rows.find((r) => r.key === 'salary')!.after).toBe(33000);
  });
});

describe('spend templates', () => {
  beforeEach(() => localStorage.clear());

  it('saves, lists per project and deletes templates', () => {
    const t = saveSpendTemplate({ name: 'الربع الأول', projectId: 'p1', dimensions: ['resource'], filters: { query: 'أيمن' }, sort: { key: 'total', dir: 'desc' } });
    saveSpendTemplate({ name: 'عام', projectId: null, dimensions: ['category'], filters: {}, sort: { key: 'total', dir: 'desc' } });
    expect(listSpendTemplates('p1')).toHaveLength(2);
    expect(listSpendTemplates('p2')).toHaveLength(1);
    deleteSpendTemplate(t.id);
    expect(listSpendTemplates('p1')).toHaveLength(1);
  });

  it('overwrites a template with the same name and scope', () => {
    saveSpendTemplate({ name: 'A', projectId: 'p1', dimensions: ['resource'], filters: {}, sort: { key: 'total', dir: 'desc' } });
    saveSpendTemplate({ name: 'A', projectId: 'p1', dimensions: ['vendor'], filters: {}, sort: { key: 'count', dir: 'asc' } });
    const list = listSpendTemplates('p1');
    expect(list).toHaveLength(1);
    expect(list[0].dimensions).toEqual(['vendor']);
  });
});

describe('outstanding advances in the spend tree', () => {
  // Same rows plus an advance still outstanding on أيمن: money handed over,
  // not yet spent, which no summary in the app counts as cost.
  const withAdvance = [
    ...expenses,
    one<Expense>({ id: 'e5', projectId: 'p1', resourceId: 'r1', category: 'salary', description: 'سلفة قائمة', amount: 4000, date: '2026-03-05', month: 3, approvalStatus: 'approved', isOutstandingAdvance: true }),
  ];

  it('keeps an outstanding advance out of every total and count, and reports it apart', () => {
    const tree = buildSpendTree(withAdvance, ['resource', 'category'], {}, { resources });
    expect(tree.grandTotal).toBe(35500);
    expect(tree.grandCount).toBe(4);
    expect(tree.outstandingAdvanceTotal).toBe(4000);
    const ayman = tree.nodes.find((n) => n.label === 'أيمن أصلان')!;
    expect(ayman.total).toBe(12000);
    expect(ayman.count).toBe(2);
    expect(ayman.expenses.map((e) => e.id)).not.toContain('e5');
  });

  it('keeps it out of the flat report the same way', () => {
    const report = buildSpendReport(withAdvance, 'resource', {}, { resources });
    expect(report.grandTotal).toBe(35500);
    expect(report.outstandingAdvanceTotal).toBe(4000);
    expect(report.groups.find((g) => g.label === 'أيمن أصلان')!.total).toBe(12000);
  });

  it('writes the figure into both exports, outside the grand total', () => {
    const tree = buildSpendTree(withAdvance, ['resource'], {}, { resources });
    expect(buildSpendTreeCSV(tree, 'مشروع')).toContain('سلف قائمة (خارج الإجمالي),4000');
    const report = buildSpendReport(withAdvance, 'resource', {}, { resources });
    expect(buildSpendReportCSV(report, 'مشروع')).toContain('سلف قائمة (خارج الإجمالي),4000');
  });
});
