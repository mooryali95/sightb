import { describe, it, expect } from 'vitest';
import { buildPayablesCSV } from '@/lib/payables-export';

const base = {
  projectId: 'p1',
  projectName: 'مشروع أ',
  resources: [{ id: 'r1', projectId: 'p1', name: 'أحمد', monthlyCost: 0 } as any],
  paymentRequests: [] as any[],
  settlements: [] as any[],
};

const reimb = (over: any) => ({
  id: Math.random().toString(),
  projectId: 'p1',
  resourceId: 'r1',
  category: 'equipment',
  description: 'بند',
  amount: 100,
  expenseDate: '2026-01-01',
  status: 'approved',
  sourceKind: 'resource',
  ...over,
} as any);

describe('buildPayablesCSV', () => {
  it('separates resource and vendor ledgers', () => {
    const csv = buildPayablesCSV({
      ...base,
      reimbursements: [
        reimb({ amount: 300 }),
        reimb({ sourceKind: 'vendor', resourceId: null, vendorName: 'مؤسسة ب', amount: 700 }),
      ],
    });
    expect(csv).toContain('مستحقات الفريق (Resource)');
    expect(csv).toContain('مستحقات الموردين (Vendor)');
    expect(csv).toContain('مؤسسة ب');
    // resource outstanding block must carry 300, vendor block 700
    expect(csv).toContain('مستحقات الفريق (Resource),المستحق غير المدفوع,300');
    expect(csv).toContain('مستحقات الموردين (Vendor),المستحق غير المدفوع,700');
  });

  it('escapes commas and quotes', () => {
    const csv = buildPayablesCSV({
      ...base,
      reimbursements: [reimb({ description: 'بند, مع "اقتباس"' })],
    });
    expect(csv).toContain('"بند, مع ""اقتباس"""');
  });
});
