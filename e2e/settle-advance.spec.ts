import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { FUND_ID, USER_ID, seed } from './support/seed';

/**
 * Closing an outstanding advance. Money that went out as an advance is
 * either documented as a real expense (which then counts in actual cost),
 * or comes back as cash to the fund it left. Each settlement is an event
 * on the request; only the documented kind creates an expense, and that
 * expense must point at the same fund the advance was paid from and be
 * bucketed by the project's month, not the calendar's.
 */
// The settlement dialog lists five settlement kinds above its footer, which
// sits below the default viewport; a taller one keeps the footer reachable.
test.use({ viewport: { width: 1280, height: 1600 } });

// A project that started six months before the seed's, so that its project
// month and the calendar month differ and the wrong one cannot pass.
const PROJECT_ID = '66666666-6666-4666-8666-666666666666';
const project = { ...seed.projects[0], id: PROJECT_ID, name: 'مشروع الأثر', start_date: '2025-07-01', end_date: '2027-06-30', duration_months: 24 };
const RESOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQ_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const stamp = { user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
const outstandingAdvance = {
  projects: [project],
  resources: [{ id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  payment_requests: [{
    id: REQ_ID, project_id: PROJECT_ID, resource_id: RESOURCE_ID, request_type: 'advance', amount: 10000, currency: 'ر.س',
    description: 'سلفة تشغيل', justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID,
    paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID,
    requested_at: '2026-02-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: USER_ID,
    approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-02-05', payment_method: 'cash',
    payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: null,
    is_advance_outstanding: true, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null,
    refunded_amount: 0, ...stamp,
  }],
};
// The project's month for today: it starts 2025-07-01 and runs 24 months.
const projectMonth = (() => {
  const now = new Date();
  const diff = (now.getFullYear() - 2025) * 12 + (now.getMonth() - 6) + 1;
  return Math.max(1, Math.min(diff, 24));
})();
const posts = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) =>
  wire.writes.filter((w) => w.table === table && w.method === 'POST').map((w) => w.body as Record<string, unknown>);

async function openSettle(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الأثر').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'مستحقات الموارد', exact: true }).click();
  await page.getByRole('tab', { name: /طلبات الصرف/ }).click();
  await page.getByRole('button', { name: 'تسوية السلفة' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'تسوية سلفة قائمة' })).toBeVisible();
  return dialog;
}

test('documenting the whole advance creates an approved expense on the same fund and one event', async ({ page }) => {
  const wire = await stubSupabase(page, outstandingAdvance);
  const dialog = await openSettle(page);
  await expect(dialog.locator('input[type="number"]').first()).toHaveValue('10000');
  await dialog.getByRole('button', { name: 'تنفيذ التسوية' }).click();
  await expect(page.getByText('تمت تسوية السلفة')).toBeVisible();

  await expect.poll(() => posts(wire, 'settlement_events').length).toBe(1);
  const expense = posts(wire, 'expenses');
  expect(expense).toHaveLength(1);
  expect(expense[0]).toMatchObject({
    project_id: PROJECT_ID, resource_id: RESOURCE_ID, category: 'other', description: 'تسوية سلفة بمستندات: سلفة تشغيل',
    month: projectMonth, approval_status: 'approved', approved_by: USER_ID, is_vat_exempt: false,
    fund_id: FUND_ID, custody_id: null, source_payment_request_id: REQ_ID,
  });
  expect(Number(expense[0].amount)).toBe(10000);
  const event = posts(wire, 'settlement_events')[0];
  expect(event).toMatchObject({ payment_request_id: REQ_ID, project_id: PROJECT_ID, event_type: 'documented', refund_to_fund_id: null, refund_to_custody_id: null, created_by: USER_ID });
  expect(Number(event.amount)).toBe(10000);
  expect(String(event.expense_id)).toMatch(/^created-expenses-/);
});

test('a partial cash refund is one event back to the paying fund, with no expense', async ({ page }) => {
  const wire = await stubSupabase(page, outstandingAdvance);
  const dialog = await openSettle(page);
  await dialog.getByText('رد نقدي', { exact: true }).click();
  await dialog.locator('input[type="number"]').first().fill('4000');
  await dialog.getByRole('button', { name: 'تنفيذ التسوية' }).click();
  await expect(page.getByText('تمت تسوية السلفة')).toBeVisible();

  await expect.poll(() => posts(wire, 'settlement_events').length).toBe(1);
  expect(posts(wire, 'expenses')).toHaveLength(0);
  const event = posts(wire, 'settlement_events')[0];
  expect(event).toMatchObject({ event_type: 'cash_refund', refund_to_fund_id: FUND_ID, refund_to_custody_id: null, expense_id: null });
  expect(Number(event.amount)).toBe(4000);
});

test('a refund larger than what is outstanding cannot be executed', async ({ page }) => {
  const wire = await stubSupabase(page, outstandingAdvance);
  const dialog = await openSettle(page);
  await dialog.getByText('رد نقدي', { exact: true }).click();
  await dialog.locator('input[type="number"]').first().fill('12000');
  await expect(dialog.getByRole('button', { name: 'تنفيذ التسوية' })).toBeDisabled();
  expect(posts(wire, 'settlement_events')).toHaveLength(0);
  expect(posts(wire, 'expenses')).toHaveLength(0);
});
