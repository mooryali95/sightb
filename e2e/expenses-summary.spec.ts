import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, FUND_ID, USER_ID, seed } from './support/seed';

/**
 * The expenses section's figures. What was spent against the contract
 * and against revenue, per resource and per responsible, all read one
 * list: an expense counts unless it was rejected or it is the expense a
 * paid advance created and the advance is still outstanding. That
 * advance is hidden from the table as a receivable, so it must not reach
 * the figures above the table either.
 */
const P = 'eeeeeeee-1111-4111-8111-eeeeeeee1153';
const RES = 'eeeeeeee-2222-4222-8222-eeeeeeee1153';
const stamp = { user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
const expense = (id: string, amount: number, responsible: string, over: Record<string, unknown> = {}) => ({
  ...seed.expenses[0], id, project_id: P, category: 'materials', amount, budget_item_id: null, description: `مصروف ${id}`,
  responsible, fund_id: FUND_ID, ...over,
});
const rows = {
  projects: [{ ...seed.projects[0], id: P, company_id: COMPANY_ID, name: 'مشروع المصروفات' }],
  resources: [{ id: RES, project_id: P, name: 'سارة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  expenses: [
    expense('ex-a', 12000, 'خالد', { resource_id: RES }),
    expense('ex-b', 3000, 'منى'),
    expense('ex-rej', 9000, 'منى', { approval_status: 'rejected', resource_id: RES }),
    // The expense a paid advance created: outstanding until the advance is settled.
    expense('ex-adv', 10000, 'خالد', { resource_id: RES, description: 'سلفة سارة' }),
  ],
  revenues: [{
    id: 'rv-1', project_id: P, user_id: USER_ID, description: 'دفعة', amount: 30000, date: '2026-02-10', month: 2, revenue_type: 'milestone',
    status: 'collected', invoice_number: null, invoice_date: null, collection_date: '2026-02-10', milestone_id: null, created_at: '2026-02-01T00:00:00Z',
  }],
  payment_requests: [{
    id: 'pr-adv', project_id: P, resource_id: RES, request_type: 'advance', amount: 10000, currency: 'SAR', description: 'سلفة', justification: null,
    linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID, paid_from_custody_id: null, budget_item_id: null, priority: 'normal',
    status: 'paid', requested_by: USER_ID, requested_at: '2026-02-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null,
    approved_by: USER_ID, approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-02-05', payment_method: 'cash',
    payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: 'ex-adv', is_advance_outstanding: true,
    advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null, refunded_amount: 0, ...stamp,
  }],
};

async function openExpenses(page: Page) {
  await stubSupabase(page, rows);
  await page.goto(`/project/${P}`);
  await expect(page.getByText('مشروع المصروفات').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  // Expenses is the finance group's default open section; clicking its header would close it.
  const header = page.getByRole('button', { name: 'المصروفات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByRole('heading', { name: 'سجل المصروفات' })).toBeVisible();
  // The table hides the advance's expense once the advance behind it has arrived.
  await expect(page.getByText('مصروف ex-a').first()).toBeVisible();
  await expect(page.getByText('سلفة سارة')).toHaveCount(0);
}
const card = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByRole('heading', { name: title }) }).first();
const figure = (scope: ReturnType<Page['locator']>, label: string) => scope.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');

test('the spend ratios leave out the rejected expense and the outstanding advance', async ({ page }) => {
  await openExpenses(page);
  await expect(page.getByText('نسبة ما صُرف من قيمة العقد (1.5%)')).toBeVisible();
  await expect(page.getByText('15,000.00 ر.س / 1,000,000.00 ر.س')).toBeVisible();
  await expect(page.getByText('نسبة ما صُرف من الإيراد (50.0%)')).toBeVisible();
  await expect(page.getByText('15,000.00 ر.س / 30,000.00 ر.س')).toBeVisible();
});

test('the per resource and per responsible cards agree with the total above them', async ({ page }) => {
  await openExpenses(page);
  const byResource = card(page, 'ملخص الصرف حسب المورد');
  await expect(figure(byResource, 'سارة')).toHaveText('12,000.00 ر.س');
  const byResponsible = card(page, 'ملخص الصرف حسب المسؤول');
  await expect(figure(byResponsible, 'خالد')).toHaveText('12,000.00 ر.س');
  await expect(figure(byResponsible, 'منى')).toHaveText('3,000.00 ر.س');
});
