/**
 * The project Excel export: what lands on each sheet. The workbook is built
 * for real and only the download is intercepted, so the sheets are the
 * ones the user would open.
 *
 * Two tests were red when written. The summary sheet printed 15% for a
 * project with no VAT (`|| 15` treats zero as missing), and the expense
 * sheet listed a rejected expense like any other row, with no status
 * column to tell it apart. The fix commit that follows turns them green
 * without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeWorkbook, type Workbook } from '@/lib/xlsx-writer';
import { exportToExcel, type ExportBudgetData } from '@/lib/export';
import type { BudgetItem, ChangeOrder, Expense, Revenue } from '@/types/project';

vi.mock('@/lib/xlsx-writer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/xlsx-writer')>()),
  writeWorkbook: vi.fn().mockResolvedValue(undefined),
}));

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: 'p-1', category: 'consulting', description: 'بند', amount: 0, date: '2026-02-01', month: 2,
    approvalStatus: 'approved', isVatExempt: false, responsible: 'أحمد', ...over,
  };
}

const budgetItem = {
  id: 'b-1', projectId: 'p-1', category: 'consulting', description: 'استشارات', plannedAmount: 20000,
  costType: 'fixed', costClass: 'direct',
} as BudgetItem;

const expenses: Expense[] = [
  expense({ id: 'ok', amount: 5000, description: 'استشارة تصميم', budgetItemId: 'b-1' }),
  expense({ id: 'rejected', amount: 3000, description: 'استشارة مرفوضة', approvalStatus: 'rejected', budgetItemId: 'b-1' }),
  expense({ id: 'pending', amount: 700, description: 'استشارة معلّقة', approvalStatus: 'pending', month: 3 }),
];

const revenues: Revenue[] = [
  { id: 'r-1', projectId: 'p-1', description: 'دفعة أولى', amount: 30000, date: '2026-02-01', month: 2, revenueType: 'advance', status: 'collected' },
];

function data(over: Partial<ExportBudgetData> = {}): ExportBudgetData {
  return {
    projectName: 'مشروع الاختبار', contractValue: 100000,
    budgetItems: [{ ...budgetItem, actual: 5000 }],
    expenses, revenues,
    totalPlanned: 20000, totalActual: 5700, totalRevenue: 30000, durationMonths: 4,
    ...over,
  };
}

async function sheetsOf(input: ExportBudgetData) {
  await exportToExcel(input);
  const wb = vi.mocked(writeWorkbook).mock.calls.at(-1)?.[0] as Workbook;
  const sheet = (name: string) => {
    const s = wb.sheets.find((x) => x.name === name);
    if (!s) throw new Error(`no sheet ${name}: ${wb.sheets.map((x) => x.name).join(', ')}`);
    return s.rows;
  };
  return { wb, sheet };
}

beforeEach(() => vi.mocked(writeWorkbook).mockClear());

describe('exportToExcel', () => {
  it('prints the summary with the project\'s own VAT rate, zero included', async () => {
    const { sheet } = await sheetsOf(data({ vatRate: 0 }));
    const rows = sheet('الملخص');
    expect(rows.find((r) => String(r['البند']).startsWith('ضريبة المخرجات'))?.['البند']).toBe('ضريبة المخرجات (0%)');
    // With no VAT the contract is the contract.
    expect(rows.find((r) => r['البند'] === 'قيمة العقد شامل الضريبة')?.['المبلغ']).toBe(100000);
  });

  it('keeps the 15% default only when no rate was given', async () => {
    const { sheet } = await sheetsOf(data());
    expect(sheet('الملخص').find((r) => r['البند'] === 'قيمة العقد شامل الضريبة')?.['المبلغ']).toBe(115000);
  });

  it('names each expense row\'s approval status, so a rejected row cannot pass for spend', async () => {
    const { sheet } = await sheetsOf(data());
    const rows = sheet('المصروفات');
    expect(rows.find((r) => r['الوصف'] === 'استشارة مرفوضة')?.['الحالة']).toBe('مرفوض');
    expect(rows.find((r) => r['الوصف'] === 'استشارة تصميم')?.['الحالة']).toBe('معتمد');
    expect(rows.find((r) => r['الوصف'] === 'استشارة معلّقة')?.['الحالة']).toBe('بانتظار الاعتماد');
  });

  it('prints each budget item\'s actual and the totals it was given', async () => {
    const { sheet } = await sheetsOf(data());
    const rows = sheet('الموازنة');
    expect(rows[0]).toMatchObject({ 'الوصف': 'استشارات', 'المبلغ المخطط': 20000, 'الفعلي': 5000, 'المتبقي': 15000 });
    expect(rows.at(-1)).toMatchObject({ 'الفئة': 'الإجمالي', 'المبلغ المخطط': 20000, 'الفعلي': 5700 });
  });

  it('accumulates the cash flow from the expenses the totals count', async () => {
    const { sheet } = await sheetsOf(data());
    const rows = sheet('التدفق النقدي');
    // Month 2: 5,000 approved; the rejected 3,000 is not spend. Month 3 adds the 700 pending.
    expect(rows[1]).toMatchObject({ 'الشهر': 'شهر 2', 'مصروفات فعلية': 5000 });
    expect(rows[2]).toMatchObject({ 'الشهر': 'شهر 3', 'مصروفات فعلية': 700 });
  });

  it('adds the change-orders sheet only when there are any, and nets approved ones into the contract', async () => {
    const none = await sheetsOf(data());
    expect(none.wb.sheets.map((s) => s.name)).not.toContain('أوامر التغيير');

    const co: ChangeOrder = {
      id: 'co-1', projectId: 'p-1', description: 'توسعة', changeType: 'scope_addition', amountImpact: 20000,
      durationImpact: 1, status: 'approved', createdAt: '',
    };
    const some = await sheetsOf(data({ changeOrders: [co, { ...co, id: 'co-2', status: 'proposed', amountImpact: 999 }] }));
    expect(some.sheet('أوامر التغيير')).toHaveLength(2);
    expect(some.sheet('الملخص').find((r) => r['البند'] === 'القيمة المعدّلة للعقد')?.['المبلغ']).toBe(120000);
  });
});
