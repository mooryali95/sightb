import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, FUND_ID, USER_ID, seed } from './support/seed';

/**
 * The budget's planning summary and reserves card. The contract with its
 * tax, the plan (a recurring item counted once per month), what is left
 * unallocated and the planned profit; the actual cost, which leaves out a
 * rejected expense and an advance not yet settled, the advance shown
 * apart as recoverable; the per-category table with its total; and the
 * reserves: the budget without contingency, contingency planned, spent
 * and left, and the management reserve held back.
 */
const P = 'eeeeeeee-1111-4111-8111-eeeeeeee1150';
const RES = 'eeeeeeee-2222-4222-8222-eeeeeeee1150';
const stamp = { user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
const item = (id: string, category: string, description: string, planned_amount: number, over: Record<string, unknown> = {}) => ({
  id, project_id: P, category, description, planned_amount, month: null, cost_type: 'fixed', start_month: null, end_month: null, created_at: '2026-01-01T00:00:00Z', ...over,
});
const expense = (id: string, category: string, amount: number, budget_item_id: string, over: Record<string, unknown> = {}) => ({
  ...seed.expenses[0], id, project_id: P, category, amount, budget_item_id, description: `مصروف ${id}`, fund_id: FUND_ID, ...over,
});
const rows = {
  projects: [{ ...seed.projects[0], id: P, company_id: COMPANY_ID, name: 'مشروع الاحتياطي', management_reserve: 25000 }],
  resources: [{ id: RES, project_id: P, name: 'سارة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  budget_items: [
    item('bi-mat', 'materials', 'بند المواد', 400000),
    item('bi-cont', 'contingency', 'احتياطي الطوارئ', 20000),
    // 5,000 a month over four months: 20,000.
    item('bi-cons', 'consulting', 'استشارة شهرية', 5000, { cost_type: 'recurring', start_month: 1, end_month: 4 }),
  ],
  expenses: [
    expense('ex-mat', 'materials', 12000, 'bi-mat'),
    expense('ex-cont', 'contingency', 3000, 'bi-cont'),
    expense('ex-rej', 'consulting', 9000, 'bi-cons', { approval_status: 'rejected' }),
    // The expense a paid advance created: outstanding until the advance is settled.
    expense('ex-adv', 'consulting', 10000, 'bi-cons', { resource_id: RES }),
  ],
  payment_requests: [{
    id: 'pr-adv', project_id: P, resource_id: RES, request_type: 'advance', amount: 10000, currency: 'SAR', description: 'سلفة', justification: null,
    linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID, paid_from_custody_id: null, budget_item_id: null, priority: 'normal',
    status: 'paid', requested_by: USER_ID, requested_at: '2026-02-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null,
    approved_by: USER_ID, approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-02-05', payment_method: 'cash',
    payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: 'ex-adv', is_advance_outstanding: true,
    advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null, refunded_amount: 0, ...stamp,
  }],
};

async function openBudget(page: Page) {
  await stubSupabase(page, rows);
  await page.goto(`/project/${P}`);
  await expect(page.getByText('مشروع الاحتياطي').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الموازنة', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByRole('heading', { name: 'ملخص تخطيط الموازنة' })).toBeVisible();
  // The figures settle once the advance behind the expense has arrived.
  await expect(page.getByText('سلف قائمة (لم تُسوَّ بعد)')).toBeVisible();
}
const card = (page: Page, title: string) => page.locator('div.stat-card', { has: page.getByRole('heading', { name: title }) }).first();
const tile = (scope: ReturnType<Page['locator']>, label: string) => scope.getByText(label, { exact: true }).locator('..');

test('the planning summary reads the contract, the plan with its recurring item, and an actual cost without the rejected expense or the unsettled advance', async ({ page }) => {
  await openBudget(page);
  const summary = card(page, 'ملخص تخطيط الموازنة');
  await expect(tile(summary, 'قيمة العقد (بدون ضريبة)')).toContainText('1,000,000.00 ر.س');
  await expect(tile(summary, 'الضريبة (15%)')).toContainText('150,000.00 ر.س');
  await expect(tile(summary, 'شامل الضريبة')).toContainText('1,150,000.00 ر.س');
  await expect(tile(summary, 'إجمالي المخطط')).toContainText('440,000.00 ر.س');
  await expect(tile(summary, 'غير مخصص')).toContainText('560,000.00 ر.س');
  await expect(tile(summary, 'الربح المخطط')).toContainText('560,000.00 ر.س (56.0%)');

  await expect(summary).toContainText('أصول قابلة للاسترداد — لا تدخل في التكلفة الفعلية (AC)');
  await expect(summary).toContainText('10,000.00 ر.س');
  await expect(summary).toContainText('1 سلفة');
  await expect(summary).toContainText('نسبة ما خُطط للصرف من الموازنة (44.0%)');
  await expect(summary).toContainText('نسبة ما صُرف من الموازنة المخططة (3.4%)');
  await expect(summary).toContainText('15,000.00 ر.س / 440,000.00 ر.س');

  const table = summary.getByRole('table');
  const row = (label: string) => table.getByRole('row').filter({ hasText: label });
  await expect(row('استشارات').getByRole('cell')).toHaveText(['استشارات', '20,000.00 ر.س', '0.00 ر.س', '20,000.00 ر.س', '2.0%']);
  await expect(row('احتياطي وطوارئ').getByRole('cell')).toHaveText(['احتياطي وطوارئ', '20,000.00 ر.س', '3,000.00 ر.س', '17,000.00 ر.س', '2.0%']);
  await expect(row('الإجمالي').getByRole('cell')).toHaveText(['الإجمالي', '440,000.00 ر.س', '15,000.00 ر.س', '425,000.00 ر.س', '44.0%']);

  // The items list reads the same actual cost.
  await expect(page.getByText('الإجمالي المخطط: 440,000.00 ر.س · الفعلي: 15,000.00 ر.س · المتبقي: 425,000.00 ر.س')).toBeVisible();
});

test('the reserves card splits the contingency out of the budget and holds the management reserve apart', async ({ page }) => {
  await openBudget(page);
  const reserves = card(page, 'تحليل الاحتياطيات');
  await expect(tile(reserves, 'الموازنة بدون احتياطي')).toContainText('420,000.00 ر.س');
  await expect(tile(reserves, 'احتياطي الطوارئ (مخطط)')).toContainText('20,000.00 ر.س');
  await expect(tile(reserves, 'احتياطي الطوارئ (مصروف)')).toContainText('3,000.00 ر.س');
  await expect(tile(reserves, 'المتبقي من الاحتياطي')).toContainText('17,000.00 ر.س');
  await expect(tile(reserves, 'الاحتياطي الإداري')).toContainText('25,000.00 ر.س');
  await expect(tile(reserves, 'الاحتياطي الإداري')).toContainText('محجوز لا يُصرف إلا بموافقة خاصة');
});
