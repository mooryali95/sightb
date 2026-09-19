import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID } from './support/seed';

/**
 * Paying an approved request out of a fund. The fund's remaining balance is
 * the transfer less what was already spent from it (50,000 less the seed's
 * 12,000 expense), and the payment must be refused when the request is
 * larger than that; when it fits, the request is written paid with the
 * method, reference, date and the fund it came out of, and never a custody
 * at the same time.
 */
const RESOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQ_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const stamp = { user_id: USER_ID, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
const approved = (amount: number) => ({
  resources: [{ id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' }],
  payment_requests: [{
    id: REQ_ID, project_id: PROJECT_ID, resource_id: RESOURCE_ID, request_type: 'advance', amount, currency: 'ر.س',
    description: 'سلفة تشغيل', justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: null,
    paid_from_custody_id: null, budget_item_id: null, priority: 'normal', status: 'approved', requested_by: USER_ID,
    requested_at: '2026-02-03T00:00:00Z', reviewed_by: null, reviewed_at: null, review_notes: null, approved_by: USER_ID,
    approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null, paid_date: null, payment_method: null,
    payment_reference: null, payment_attachments: [], rejection_reason: null, auto_created_expense_id: null,
    is_advance_outstanding: false, advance_settled_at: null, advance_settled_by: null, settlement_type: null, settled_amount: null, ...stamp,
  }],
});
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'payment_requests' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

async function openPay(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'مستحقات الموارد', exact: true }).click();
  await page.getByRole('tab', { name: /طلبات الصرف/ }).click();
  await page.getByRole('button', { name: 'تأكيد الدفع' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'تأكيد الدفع' })).toBeVisible();
  return dialog;
}

test('a request the fund can cover is written paid from that fund with its method and reference', async ({ page }) => {
  const wire = await stubSupabase(page, approved(20000));
  const dialog = await openPay(page);
  await expect(dialog).toContainText('المبلغ المطلوب: 20,000.00');
  await expect(dialog).toContainText('38,000.00');
  await dialog.getByPlaceholder('رقم التحويل/الشيك').fill('TRX-77');
  await dialog.getByRole('button', { name: 'تأكيد الدفع' }).click();

  await expect(page.getByText('تم تأكيد الدفع وتسجيل المصروف تلقائياً')).toBeVisible();
  await expect.poll(() => patches(wire).length).toBe(1);
  const paid = patches(wire)[0];
  expect(paid).toMatchObject({
    status: 'paid', payment_method: 'bank_transfer', payment_reference: 'TRX-77',
    paid_from_fund_id: FUND_ID, paid_from_custody_id: null, payment_attachments: [],
  });
  expect(String(paid.paid_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('button', { name: 'تأكيد الدفع' })).toHaveCount(0);
});

test('a request larger than the fund balance is refused with the balance, and nothing is written', async ({ page }) => {
  const wire = await stubSupabase(page, approved(45000));
  const dialog = await openPay(page);
  await dialog.getByRole('button', { name: 'تأكيد الدفع' }).click();

  await expect(page.getByText('رصيد الدفعة غير كافٍ. المتاح: 38,000.00 ر.س')).toBeVisible();
  expect(patches(wire)).toHaveLength(0);
  await expect(dialog).toBeVisible();
});
