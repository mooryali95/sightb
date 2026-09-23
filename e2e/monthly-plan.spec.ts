import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { USER_ID, seed } from './support/seed';

/**
 * The monthly spend plan under the budget, on a fixed calendar date so the
 * current month is the sixth. A one-off item lands whole in its month, a
 * recurring one repeats its amount over its span, a fixed one spreads
 * evenly; expenses bucket by their month, a rejected one and an
 * outstanding advance are left out, and only collected revenue counts.
 * Each month is graded against its plan: an unplanned spend is over, 90%
 * is near the limit, a month past the current one is future, and one with
 * nothing on either side is inactive. The cards and the table read the
 * same rows; the table adds the totals.
 */
const PLAN_ID = 'bbbbbbbb-1111-4111-8111-bbbbbbbb1138';
const item = (id: string, description: string, planned_amount: number, over: Record<string, unknown>) => ({
  id, project_id: PLAN_ID, category: 'other', description, planned_amount, month: null, cost_type: 'fixed', start_month: null, end_month: null, created_at: '2026-01-01T00:00:00Z', ...over,
});
const expense = (id: string, month: number, amount: number, over: Record<string, unknown> = {}) => ({
  ...seed.expenses[0], id, project_id: PLAN_ID, fund_id: null, month, date: `2026-${String(month).padStart(2, '0')}-10`, amount, description: `صرف ${month}`, ...over,
});
const rows = {
  projects: [{ ...seed.projects[0], id: PLAN_ID, name: 'مشروع الخطة', contract_value: 200000 }],
  budget_items: [
    item('bi-once', 'دفعة واحدة', 30000, { cost_type: 'one_time', start_month: 2 }),
    item('bi-rec', 'اشتراك شهري', 5000, { cost_type: 'recurring', start_month: 4, end_month: 6 }),
    item('bi-fix', 'تجهيزات', 24000, { cost_type: 'fixed', start_month: 7, end_month: 12 }),
  ],
  expenses: [
    expense('ex-1', 1, 700),
    expense('ex-2', 2, 31000),
    expense('ex-4', 4, 4500),
    expense('ex-5', 5, 1000),
    expense('ex-5r', 5, 9000, { approval_status: 'rejected' }),
    expense('ex-5a', 5, 8000),
  ],
  // The database carries no flag on an advance's expense: it is outstanding while the paid advance that created it is.
  payment_requests: [{
    id: 'pr-5a', project_id: PLAN_ID, resource_id: 'res-plan', request_type: 'advance', amount: 8000, currency: 'SAR',
    description: 'سلفة', justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: null,
    paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID,
    requested_at: '2026-05-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: USER_ID,
    approved_at: '2026-05-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-05-10', payment_method: 'cash',
    payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: 'ex-5a',
    is_advance_outstanding: true, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null,
    refunded_amount: 0, created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-10T00:00:00Z',
  }],
  revenues: [
    { id: 'rv-4', project_id: PLAN_ID, user_id: USER_ID, description: 'دفعة محصّلة', amount: 10000, date: '2026-04-20', month: 4, revenue_type: 'milestone', status: 'collected', invoice_number: null, invoice_date: null, collection_date: '2026-04-20', milestone_id: null, created_at: '2026-04-01T00:00:00Z' },
    { id: 'rv-6', project_id: PLAN_ID, user_id: USER_ID, description: 'دفعة مخطّطة', amount: 50000, date: '2026-06-20', month: 6, revenue_type: 'milestone', status: 'planned', invoice_number: null, invoice_date: null, collection_date: null, milestone_id: null, created_at: '2026-04-01T00:00:00Z' },
  ],
};

async function openPlan(page: Page) {
  await page.clock.setFixedTime(new Date('2026-06-15T09:00:00Z'));
  await stubSupabase(page, rows);
  await page.goto(`/project/${PLAN_ID}`);
  await expect(page.getByText('مشروع الخطة').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الموازنة', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const plan = page.locator('div.stat-card', { has: page.getByRole('heading', { name: 'خطة الصرف الشهرية' }) }).first();
  await expect(plan).toBeVisible();
  return plan;
}
// The strip is the card's first grid; the legend below repeats two of its labels.
const tile = (plan: ReturnType<Page['locator']>, label: string) => plan.locator('div.grid').first().getByText(label, { exact: true }).locator('..');
// Exact to the month: "شهر 1" is a prefix of months 10 to 12; the current month's name ends in a dot.
const monthCard = (plan: ReturnType<Page['locator']>, month: number) => plan.getByText(new RegExp(`^شهر ${month}●?$`)).locator('xpath=ancestor::div[2]');

/**
 * Hovers a month card until its tooltip opens. The card can still be moving
 * while the section animates open, so a single hover may land beside it.
 */
async function hoverMonth(page: Page, plan: ReturnType<Page['locator']>, month: number) {
  const tip = page.getByRole('tooltip').filter({ hasText: `شهر ${month} —` });
  await expect(async () => {
    await page.mouse.move(0, 0);
    await monthCard(plan, month).hover();
    await expect(tip).toBeVisible({ timeout: 1000 });
  }).toPass();
  return tip;
}

test('buckets the plan and the spend by month, grades each month, and sums the strip', async ({ page }) => {
  const plan = await openPlan(page);
  await expect(tile(plan, 'إجمالي مخطط')).toContainText('69,000.00 ر.س');
  await expect(tile(plan, 'إجمالي فعلي')).toContainText('37,200.00 ر.س');
  await expect(tile(plan, 'ضمن الخطة')).toContainText('2 شهر');
  await expect(tile(plan, 'تجاوزت')).toContainText('2 شهر');

  // Month 1: spend with no plan is over; month 2: the one-off item, 103% used.
  await expect(monthCard(plan, 1)).toContainText('700.00 ر.س');
  await expect(monthCard(plan, 1)).toContainText('—');
  await expect(monthCard(plan, 2)).toContainText('30,000.00 ر.س');
  await expect(monthCard(plan, 2)).toContainText('31,000.00 ر.س');
  await expect(monthCard(plan, 2)).toContainText('-1,000.00 ر.س');
  await expect(monthCard(plan, 2)).toContainText('103%');
  // Month 4: the recurring item, 90% used, near the limit; month 5: only the approved 1,000 counts.
  await expect(monthCard(plan, 4)).toContainText('5,000.00 ر.س');
  await expect(monthCard(plan, 4)).toContainText('4,500.00 ر.س');
  await expect(monthCard(plan, 4)).toContainText('+500.00 ر.س');
  await expect(monthCard(plan, 4)).toContainText('90%');
  await expect(monthCard(plan, 5)).toContainText('1,000.00 ر.س');
  await expect(monthCard(plan, 5)).toContainText('20%');
  // Month 6 is the current one; months 7 to 12 carry the fixed item's sixth.
  await expect(monthCard(plan, 6)).toContainText('●');
  await expect(monthCard(plan, 7)).toContainText('4,000.00 ر.س');
  await expect(monthCard(plan, 12)).toContainText('4,000.00 ر.س');

  const tip = await hoverMonth(page, plan, 2);
  await expect(tip).toContainText('شهر 2 — تجاوز');
  await expect(tip).toContainText('البنود المخصصة (1):');
  await expect(tip).toContainText('أخرى: دفعة واحدة');
  await expect(tip).toContainText('30,000.00 ر.س');
  await expect(tip).toContainText('تراكمي مخطط:');
});

test('the table reads the same rows with their status, the collected revenue and the totals', async ({ page }) => {
  const plan = await openPlan(page);
  // A month with nothing planned and nothing spent says so on hover.
  const tip3 = await hoverMonth(page, plan, 3);
  await expect(tip3).toContainText('شهر 3 — بدون نشاط');
  await expect(tip3).toContainText('لا توجد بنود مخصصة لهذا الشهر');
  await page.mouse.move(0, 0);

  await plan.getByRole('button', { name: 'جدول' }).click();
  const table = plan.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(14);
  // The current month's cell carries a dot after its name.
  const row = (month: number) => table.getByRole('row').filter({ has: page.getByRole('cell', { name: new RegExp(`^شهر ${month}●?$`) }) });
  await expect(row(1)).toContainText('تجاوز');
  await expect(row(2)).toContainText('تجاوز');
  await expect(row(2)).toContainText('103.3%');
  await expect(row(3)).toContainText('بدون نشاط');
  await expect(row(4)).toContainText('قرب الحد');
  await expect(row(4)).toContainText('10,000.00 ر.س');
  await expect(row(4)).toContainText('5,500.00 ر.س');
  await expect(row(5)).toContainText('ضمن الخطة');
  await expect(row(5)).toContainText('37,200.00 ر.س');
  await expect(row(6)).toContainText('ضمن الخطة');
  await expect(row(6)).toContainText('0.00 ر.س');
  await expect(row(7)).toContainText('مستقبل');

  const totals = table.getByRole('row').last();
  await expect(totals).toContainText('الإجمالي');
  await expect(totals).toContainText('69,000.00 ر.س');
  await expect(totals).toContainText('37,200.00 ر.س');
  await expect(totals).toContainText('31,800.00 ر.س');
  await expect(totals).toContainText('53.9%');
  await expect(totals).toContainText('10,000.00 ر.س');
  await expect(totals).toContainText('-27,200.00 ر.س');

  await plan.getByRole('button', { name: 'بطاقات' }).click();
  await expect(plan.getByRole('table')).toHaveCount(0);
  await expect(monthCard(plan, 2)).toContainText('103%');
});
