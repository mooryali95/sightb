import { describe, it, expect } from 'vitest';
import {
  buildSpendReport, filterExpenses, buildSpendReportCSV, UNASSIGNED_KEY,
} from '@/lib/expense-analytics';

const resources = [
  { id: 'r1', projectId: 'p1', userId: 'u', name: 'أيمن أصلان', monthlyCost: 0 },
  { id: 'r2', projectId: 'p1', userId: 'u', name: 'أحمد صبري', monthlyCost: 0 },
] as any[];

const expenses = [
  { id: 'e1', projectId: 'p1', resourceId: 'r1', category: 'salary', description: 'راتب يناير', amount: 10000, date: '2026-01-05', month: 1, approvalStatus: 'approved', isVatExempt: false, vendor: 'مكتب أ' },
  { id: 'e2', projectId: 'p1', resourceId: 'r1', category: 'other', description: 'مواصلات', amount: 2209.16, date: '2026-02-10', month: 2, approvalStatus: 'pending', isVatExempt: false },
  { id: 'e3', projectId: 'p1', resourceId: 'r2', category: 'salary', description: 'راتب يناير', amount: 23000, date: '2026-01-05', month: 1, approvalStatus: 'approved', isVatExempt: false },
  { id: 'e4', projectId: 'p1', category: 'other', description: 'قرطاسية', amount: 500, date: '2026-03-01', month: 3, approvalStatus: 'rejected', isVatExempt: false },
] as any[];

describe('expense-analytics', () => {
  it('groups by resource and totals each one', () => {
    const rep = buildSpendReport(expenses, 'resource', {}, { resources });
    const ayman = rep.groups.find((g) => g.label === 'أيمن أصلان')!;
    expect(ayman.total).toBeCloseTo(12209.16);
    expect(ayman.approved).toBe(10000);
    expect(ayman.pending).toBeCloseTo(2209.16);
    expect(ayman.count).toBe(2);
  });

  it('excludes rejected amounts from totals but reports them', () => {
    const rep = buildSpendReport(expenses, 'resource', {}, { resources });
    expect(rep.rejectedTotal).toBe(500);
    expect(rep.grandTotal).toBeCloseTo(10000 + 2209.16 + 23000);
    const unassigned = rep.groups.find((g) => g.key === UNASSIGNED_KEY)!;
    expect(unassigned.total).toBe(0);
    expect(unassigned.rejected).toBe(500);
  });

  it('sorts groups descending and computes share', () => {
    const rep = buildSpendReport(expenses, 'resource', {}, { resources });
    expect(rep.groups[0].label).toBe('أحمد صبري');
    const sum = rep.groups.reduce((s, g) => s + g.share, 0);
    expect(sum).toBeCloseTo(100);
  });

  it('breaks each group down by category — "in what it was spent"', () => {
    const rep = buildSpendReport(expenses, 'resource', {}, { resources });
    const ayman = rep.groups.find((g) => g.label === 'أيمن أصلان')!;
    expect(ayman.byCategory.map((c) => c.key)).toEqual(['salary', 'other']);
  });

  it('searches across description, vendor and resource name', () => {
    expect(filterExpenses(expenses, { query: 'أيمن' }, { resources })).toHaveLength(2);
    expect(filterExpenses(expenses, { query: 'مكتب أ' }, { resources })).toHaveLength(1);
    expect(filterExpenses(expenses, { query: 'قرطاسية' }, { resources })).toHaveLength(1);
  });

  it('respects date range and status filters', () => {
    const jan = buildSpendReport(expenses, 'resource', { dateFrom: '2026-01-01', dateTo: '2026-01-31' }, { resources });
    expect(jan.grandTotal).toBe(33000);
    const approved = buildSpendReport(expenses, 'resource', { approvalStatus: 'approved' }, { resources });
    expect(approved.grandCount).toBe(2);
  });

  it('drills down to a single group key', () => {
    const rep = buildSpendReport(expenses, 'resource', { groupKey: 'r2' }, { resources });
    expect(rep.groups).toHaveLength(1);
    expect(rep.grandTotal).toBe(23000);
  });

  it('groups by category and by vendor too', () => {
    const byCat = buildSpendReport(expenses, 'category', {}, { resources });
    expect(byCat.groups.find((g) => g.key === 'salary')!.total).toBe(33000);
    const byVendor = buildSpendReport(expenses, 'vendor', {}, { resources });
    expect(byVendor.groups.find((g) => g.key === 'مكتب أ')!.total).toBe(10000);
  });

  it('exports a CSV with group and line-item blocks', () => {
    const rep = buildSpendReport(expenses, 'resource', {}, { resources });
    const csv = buildSpendReportCSV(rep, 'مشروع تجريبي');
    expect(csv).toContain('مشروع تجريبي');
    expect(csv).toContain('أيمن أصلان');
    expect(csv).toContain('الإجمالي العام');
  });
});
