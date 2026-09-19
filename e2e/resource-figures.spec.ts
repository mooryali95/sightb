import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID } from './support/seed';

/**
 * What a resource is planned to cost against what it has cost. Without a
 * linked plan line the plan is the monthly cost over the project, flagged
 * as an estimate; with one, the plan is that line. Spend counts approved
 * expenses charged to the resource, never a rejected one or an advance
 * still outstanding. Editing the monthly cost moves the estimate at once;
 * deleting the resource also writes the project's new headcount.
 */
const RESOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const resource = { id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' };
const expense = (id: string, amount: number, over: Record<string, unknown> = {}) => ({
  id, project_id: PROJECT_ID, resource_id: RESOURCE_ID, category: 'salary', description: 'راتب', amount, date: '2026-02-01', month: 2,
  approval_status: 'approved', is_vat_exempt: true, fund_id: FUND_ID, user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', ...over,
});
const expenses = [
  expense('ex-ok', 20000),
  expense('ex-rejected', 5000, { approval_status: 'rejected' }),
  expense('ex-advance', 3000, { source_payment_request_id: 'req-adv' }),
];
// The paid, unsettled advance that created the third expense: it is cash out, not spend, until settled.
const outstandingAdvance = {
  id: 'req-adv', project_id: PROJECT_ID, resource_id: RESOURCE_ID, request_type: 'advance', amount: 3000, currency: 'ر.س',
  description: 'سلفة', justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID,
  paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID,
  requested_at: '2026-02-01T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: USER_ID,
  approved_at: '2026-02-01T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-02-01', payment_method: 'cash',
  payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: 'ex-advance',
  is_advance_outstanding: true, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null,
  refunded_amount: 0, user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
};
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string, method: string) =>
  wire.writes.filter((w) => w.table === table && w.method === method).map((w) => w.body as Record<string, unknown>);

async function openResources(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'التخطيط' }).click();
  const header = page.getByRole('button', { name: 'الموارد', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText('الموارد البشرية')).toBeVisible();
}
const row = (page: Page) => page.getByRole('row').filter({ hasText: 'سارة المهندسة' });

test('an unplanned resource is estimated over the project, charged only with counted spend, and re-estimated on edit', async ({ page }) => {
  const wire = await stubSupabase(page, { resources: [resource], expenses, payment_requests: [outstandingAdvance] });
  await openResources(page);
  await expect(page.getByText('1 مورد · التكلفة الشهرية: 9,000.00 ر.س')).toBeVisible();
  // 9,000 × 12 months, flagged as an estimate; 20,000 counted of the 28,000 charged.
  await expect(row(page)).toContainText('108,000.00 ر.س*');
  await expect(row(page)).toContainText('20,000.00');
  await expect(row(page)).toContainText('88,000.00');
  await expect(row(page)).toContainText('19%');

  await row(page).getByRole('button').nth(1).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'تعديل المورد' })).toBeVisible();
  await dialog.locator('input[type="number"]').fill('12000');
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('تم تعديل المورد')).toBeVisible();
  await expect.poll(() => writes(wire, 'resources', 'PATCH').length).toBe(1);
  expect(writes(wire, 'resources', 'PATCH')[0]).toStrictEqual({ name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 12000 });
  await expect(row(page)).toContainText('144,000.00 ر.س*');
  await expect(row(page)).toContainText('124,000.00');
  await expect(row(page)).toContainText('14%');
  await expect(page.getByText('1 مورد · التكلفة الشهرية: 12,000.00 ر.س')).toBeVisible();
});

test('a resource with a plan line is measured on that line, and deleting it rewrites the headcount', async ({ page }) => {
  const wire = await stubSupabase(page, {
    resources: [resource],
    expenses: [expense('ex-ok', 20000)],
    budget_items: [{ id: 'bi-sal', project_id: PROJECT_ID, category: 'salary', description: 'راتب سارة', planned_amount: 10000, month: null, start_month: 1, end_month: 12, cost_type: 'recurring', resource_id: RESOURCE_ID, created_at: '2026-01-01T00:00:00Z' }],
  });
  await openResources(page);
  // 10,000 × 12 from the plan line, not the estimate; no asterisk.
  await expect(row(page)).toContainText('120,000.00');
  await expect(row(page)).not.toContainText('*');
  await expect(row(page)).toContainText('17%');

  await row(page).getByRole('button').nth(2).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'حذف المورد' })).toBeVisible();
  await confirm.getByRole('button', { name: 'حذف' }).click();
  await expect.poll(() => writes(wire, 'projects', 'PATCH').length).toBe(1);
  expect(wire.writes.filter((w) => w.table === 'resources' && w.method === 'DELETE')).toHaveLength(1);
  expect(writes(wire, 'projects', 'PATCH')[0]).toStrictEqual({ resource_count: 0 });
  await expect(row(page)).toHaveCount(0);
  await expect(page.getByText('0 مورد · التكلفة الشهرية: 0.00 ر.س')).toBeVisible();
});
