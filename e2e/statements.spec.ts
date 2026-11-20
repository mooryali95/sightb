import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID } from './support/seed';

/**
 * «القوائم المالية» on the central financial screen, on 30 June 2026: the
 * income statement by invoice date with the company's own cost from its
 * ledger, the cash month by month with a lender's loan counted in, and the
 * receivables by age. MAP_SHOTS=<dir> saves light and dark screenshots.
 */
const revenue = (id: string, amount: number, status: string, invoice_date: string, collection_date: string | null = null) => ({
  id, project_id: PROJECT_ID, description: id, amount, date: invoice_date, month: 1, status, invoice_date, collection_date, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z',
});
const rows = {
  revenues: [
    revenue('rv-paid', 300000, 'collected', '2026-02-10', '2026-03-15'),
    revenue('rv-new', 120000, 'invoiced', '2026-06-01'),
    revenue('rv-late', 80000, 'invoiced', '2026-02-01'),
  ],
  expenses: [{ id: 'ex-big', project_id: PROJECT_ID, category: 'other', description: 'مقاول', amount: 150000, date: '2026-04-10', month: 4,
    approval_status: 'approved', is_vat_exempt: true, fund_id: null, custody_id: null, user_id: USER_ID, created_at: '2026-04-10T00:00:00Z' }],
  parties: [{ id: 'lender', company_id: COMPANY_ID, name: 'مقرض', kind: 'person', user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  company_expenses: [{ id: 'ce-1', company_id: COMPANY_ID, date: '2026-05-01', amount: 40000, description: 'رواتب الإدارة', kind: 'salary', party_id: null, paid_by_party_id: null, user_id: USER_ID, created_at: '2026-05-01T00:00:00Z' }],
  company_expense_allocations: [],
  intercompany_entries: [{ id: 'loan', company_id: COMPANY_ID, date: '2026-01-15', amount: 100000, type: 'advance', note: '', due_date: null, salary_expense_id: null, source_fund_id: null,
    from_kind: 'party', from_id: 'lender', to_kind: 'company', to_id: null, user_id: USER_ID, created_at: '2026-01-15T00:00:00Z' }],
};

for (const theme of ['light', 'dark'] as const) {
  test(`states income, cash and receivables for the year so far (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-06-30T09:00:00'));
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await stubSupabase(page, rows);
    await page.goto('/finance');
    const panel = page.getByRole('region', { name: 'القوائم المالية' });
    const income = panel.getByRole('article', { name: 'قائمة الدخل' });
    // 500,000 billed; 12,000 seeded + 150,000 direct; 40,000 of the company's own.
    await expect(income).toContainText('الإيراد المفوتر500,000.00');
    await expect(income).toContainText('= مجمل الربح338,000.00');
    await expect(income).toContainText('− مصاريف المنظومة40,000.00');
    await expect(income).toContainText('= صافي الربح298,000.00');

    const cash = panel.getByRole('article', { name: 'التدفق النقدي' });
    await expect(cash.getByRole('row').filter({ hasText: 'يناير 2026' })).toContainText('100,000.00');   // the loan
    await expect(cash.getByRole('row').filter({ hasText: 'أبريل 2026' })).toContainText('▼ -150,000.00');
    await expect(cash.getByRole('row').filter({ hasText: 'المجموع' })).toContainText('198,000.00');

    const aging = panel.getByRole('article', { name: 'أعمار الذمم' });
    await expect(aging).toContainText('متأخر أكثر من 30 يوماً: 80,000.00');

    const dir = process.env.MAP_SHOTS;
    if (dir) await panel.screenshot({ path: `${dir}/statements-${theme}.png`, animations: 'disabled' });

    await panel.getByRole('button', { name: 'هذا الشهر' }).click();
    await expect(page).toHaveURL(/span=month/);
    await expect(income).toContainText('الإيراد المفوتر120,000.00');
  });
}
