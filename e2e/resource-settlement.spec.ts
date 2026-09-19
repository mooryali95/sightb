import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Settling a resource for good. The draft totals what the person is owed
 * (approved reimbursements) against what was paid (paid requests), drafts
 * the Arabic declaration from those figures naming the company and the
 * project, and saves it as a draft linked to the rows it counted. Signing
 * closes it and marks the linked reimbursements reimbursed, so the same
 * money can never be requested twice.
 */
const RESOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REIMB_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REQ_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SETTLE_ID = '99999999-9999-4999-8999-999999999999';
const stamp = { user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
const base = {
  resources: [{ id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  resource_reimbursements: [{
    id: REIMB_ID, project_id: PROJECT_ID, resource_id: RESOURCE_ID, source_kind: 'resource', vendor_name: null,
    category: 'transport', description: 'تنقلات الموقع', amount: 4000, expense_date: '2026-02-01', receipt_attachments: [],
    budget_item_id: null, status: 'approved', notes: null, rejection_reason: null, approved_by: USER_ID,
    approved_at: '2026-02-02T00:00:00Z', payment_request_id: null, settled_expense_id: null, settled_at: null, ...stamp,
  }],
  payment_requests: [{
    id: REQ_ID, project_id: PROJECT_ID, resource_id: RESOURCE_ID, request_type: 'advance', amount: 1500, currency: 'ر.س',
    description: 'سلفة سفر', justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: null,
    paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID,
    requested_at: '2026-02-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: USER_ID,
    approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: '2026-02-05', payment_method: 'cash',
    payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: null,
    is_advance_outstanding: false, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null, ...stamp,
  }],
};
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string, method: string) =>
  wire.writes.filter((w) => w.table === table && w.method === method).map((w) => w.body as Record<string, unknown>);

async function openPayables(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'مستحقات الموارد', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'أرصدة الموارد' })).toBeVisible();
}

test('the draft totals owed against paid, names the company and project, and links what it counted', async ({ page }) => {
  const wire = await stubSupabase(page, base);
  await openPayables(page);
  await page.getByRole('row').filter({ hasText: 'سارة المهندسة' }).getByRole('button', { name: 'مخالصة' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'إنشاء مخالصة نهائية — سارة المهندسة' })).toBeVisible();
  await expect(dialog).toContainText('4,000.00');
  await expect(dialog).toContainText('1,500.00');
  await expect(dialog).toContainText('2,500.00');
  const text = await dialog.locator('textarea').inputValue();
  expect(text).toContain('سارة المهندسة');
  expect(text).toContain('عن مشروع مشروع الاختبار');
  expect(text).toContain('من شركة شركة الاختبار');
  expect(text).toContain('(2,500) ر.س');

  await dialog.getByRole('button', { name: 'إنشاء كمسودة' }).click();
  await expect(page.getByText('تم إنشاء المخالصة كمسودة')).toBeVisible();
  await expect.poll(() => writes(wire, 'resource_settlements', 'POST').length).toBe(1);
  const posted = writes(wire, 'resource_settlements', 'POST')[0];
  expect(posted).toMatchObject({
    resource_id: RESOURCE_ID, project_id: PROJECT_ID, status: 'draft', created_by: USER_ID,
    linked_reimbursement_ids: [REIMB_ID], linked_payment_ids: [REQ_ID],
  });
  expect(Number(posted.total_owed)).toBe(4000);
  expect(Number(posted.total_paid)).toBe(1500);
  expect(Number(posted.balance)).toBe(2500);
  expect(String(posted.settlement_text_ar)).toContain('شركة الاختبار');

  await page.getByRole('tab', { name: /المخالصات/ }).click();
  await expect(page.getByText('مسودة', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'توقيع وإقفال المخالصة' })).toBeVisible();
});

test('signing closes the settlement and marks its reimbursements reimbursed', async ({ page }) => {
  const wire = await stubSupabase(page, {
    ...base,
    resource_settlements: [{
      id: SETTLE_ID, resource_id: RESOURCE_ID, project_id: PROJECT_ID, period_from: '2026-01-01', period_to: '2026-02-28',
      total_owed: 4000, total_paid: 1500, balance: 2500, linked_reimbursement_ids: [REIMB_ID], linked_payment_ids: [REQ_ID],
      settlement_text_ar: 'نص المخالصة', status: 'draft', signed_by_resource: false, signature_attachment: null, signed_at: null,
      notes: null, created_by: USER_ID, ...stamp,
    }],
  });
  await openPayables(page);
  await page.getByRole('tab', { name: /المخالصات/ }).click();
  await expect(page.getByText('2026-01-01 → 2026-02-28')).toBeVisible();

  await page.getByRole('button', { name: 'توقيع وإقفال المخالصة' }).click();
  await expect(page.getByText('تم توقيع المخالصة')).toBeVisible();

  await expect.poll(() => writes(wire, 'resource_reimbursements', 'PATCH').length).toBe(1);
  const signed = writes(wire, 'resource_settlements', 'PATCH');
  expect(signed).toHaveLength(1);
  expect(signed[0]).toMatchObject({ status: 'signed', signed_by_resource: true, signature_attachment: null });
  expect(typeof signed[0].signed_at).toBe('string');
  expect(writes(wire, 'resource_reimbursements', 'PATCH')[0]).toStrictEqual({ status: 'reimbursed' });

  await expect(page.getByText('موقّعة', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'توقيع وإقفال المخالصة' })).toHaveCount(0);
});
