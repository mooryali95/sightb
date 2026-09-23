import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { FUND_ID, PROJECT_ID, USER_ID } from './support/seed';

/**
 * One outstanding advance, in the shape the database has written since
 * 22 May: a paid advance request and no expense row, since an advance is
 * a receivable until it is settled. 6,000 was handed over from fund #1
 * and 1,000 came back, so 5,000 is still out. Every screen that reports
 * outstanding advances reads that same 5,000: the budget's planning
 * summary, the spend explorer's tile, the payables card, and fund #1's
 * breakdown, where it is part of what the fund has paid out. A second
 * advance, settled in full, is out nowhere.
 */
const RES = 'eeeeeeee-2222-4222-8222-eeeeeeee1155';
const advance = (over: Record<string, unknown>) => ({
  id: 'pr-adv', project_id: PROJECT_ID, resource_id: RES, request_type: 'advance', amount: 6000, currency: 'SAR', description: 'سلفة ميدانية',
  justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID, paid_from_custody_id: null,
  budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID, requested_at: '2026-02-03T00:00:00Z', reviewed_by: null,
  reviewed_at: null, review_notes: null, approved_by: USER_ID, approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null,
  paid_date: '2026-02-05', payment_method: 'cash', payment_reference: null, payment_attachments: [], rejection_reason: null,
  auto_created_expense_id: null, is_advance_outstanding: true, advance_settled_at: null, advance_settled_by: null,
  settlement_type: null, settled_amount: null, refunded_amount: 1000,
  user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-05T00:00:00Z', ...over,
});
const rows = {
  resources: [{ id: RES, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  payment_requests: [
    advance({}),
    // Settled in full: nothing is out on it anywhere.
    advance({ id: 'pr-settled', amount: 9000, refunded_amount: 0, is_advance_outstanding: false, advance_settled_at: '2026-02-20T00:00:00Z', settlement_type: 'documented', settled_amount: 9000 }),
  ],
};

async function openFinance(page: Page) {
  await stubSupabase(page, rows);
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
}
async function openSection(page: Page, name: string) {
  const header = page.getByRole('button', { name, exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}

test("the budget's planning summary reads what is still out on the advance, net of what came back", async ({ page }) => {
  await openFinance(page);
  await openSection(page, 'الموازنة');
  const card = page.getByText('سلف قائمة (لم تُسوَّ بعد)').locator('../..');
  await expect(card).toContainText('5,000.00 ر.س');
  await expect(card).toContainText('1 سلفة');
});

test("the spend explorer's tile reads the advance, though no expense row carries it", async ({ page }) => {
  await openFinance(page);
  const region = page.getByRole('region', { name: 'المصروفات' }).locator('div.stat-card', { hasText: 'مستكشف الصرف — تجميع متعدد المستويات' });
  await expect(region.getByText('مستكشف الصرف — تجميع متعدد المستويات')).toBeVisible();
  // The seed's 12,000 is the only spend; the advance is not spend.
  await expect(region.getByText('سلف قائمة (خارج الإجمالي)').locator('..')).toContainText('5,000.00 ر.س');
});

test('the payables card and the fund breakdown read the same 5,000', async ({ page }) => {
  await openFinance(page);
  await openSection(page, 'مستحقات الموارد');
  await expect(page.getByText('سلف قائمة (غير مسوّاة)', { exact: true }).locator('xpath=following-sibling::div[1]')).toHaveText('5,000.00 ر.س');

  await openSection(page, 'الدفعات');
  const fundRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '#1', exact: true }) }).first();
  const inspector = page.getByRole('dialog');
  // Under load a click can land while the table re-renders and open nothing; retry until the inspector is up.
  await expect(async () => {
    if (!(await inspector.isVisible())) await fundRow.getByRole('button', { name: 'عرض التفاصيل' }).click();
    await expect(inspector).toBeVisible({ timeout: 1000 });
  }).toPass();
  const field = (label: string) => inspector.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
  await expect(field('مصروف مباشر')).toHaveText('12,000.00 ر.س');
  await expect(field('سلف قائمة')).toHaveText('5,000.00 ر.س');
  // 50,000 less 12,000 spent directly and 5,000 still out on the advance.
  await expect(inspector).toContainText('33,000.00 ر.س');
});
