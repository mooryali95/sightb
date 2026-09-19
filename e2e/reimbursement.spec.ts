import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * A resource's own-pocket claim. It is recorded pending, never approved by
 * the person who typed it; an admin's approval stamps who and when and
 * moves the amount into the resource's approved balance; a rejection needs
 * a written reason and keeps the amount out of every balance.
 */
const RESOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REIMB_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const resource = { id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' };
const pending = {
  id: REIMB_ID, project_id: PROJECT_ID, resource_id: RESOURCE_ID, source_kind: 'resource', vendor_name: null,
  category: 'equipment', description: 'لابتوب للمشروع', amount: 4000, expense_date: '2026-02-01', receipt_attachments: [],
  budget_item_id: null, status: 'pending_review', notes: null, rejection_reason: null, approved_by: null, approved_at: null,
  payment_request_id: null, settled_expense_id: null, settled_at: null, user_id: USER_ID,
  created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
};
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, method: string) =>
  wire.writes.filter((w) => w.table === 'resource_reimbursements' && w.method === method).map((w) => w.body as Record<string, unknown>);

async function openReimbursements(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'مستحقات الموارد', exact: true }).click();
  await page.getByRole('tab', { name: /الاستردادات/ }).click();
  await expect(page.getByRole('heading', { name: 'قائمة الاستردادات' })).toBeVisible();
}
const balanceRow = (page: Page) => page.getByRole('row').filter({ hasText: 'سارة المهندسة' }).first();
const claimRow = (page: Page) => page.getByRole('row').filter({ hasText: 'لابتوب للمشروع' });

test('a claim is recorded pending under its resource, and an empty form is refused', async ({ page }) => {
  const wire = await stubSupabase(page, { resources: [resource] });
  await openReimbursements(page);
  await page.getByRole('button', { name: 'تسجيل استرداد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('يرجى تعبئة الحقول المطلوبة')).toBeVisible();
  expect(writes(wire, 'POST')).toHaveLength(0);

  await dialog.getByRole('combobox').filter({ hasText: 'اختر المورد' }).click();
  await page.getByRole('option', { name: /سارة المهندسة/ }).click();
  await dialog.getByPlaceholder('لابتوب للمشروع').fill('  لابتوب للمشروع  ');
  await dialog.getByPlaceholder('4500').fill('4500');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('تم تسجيل الاسترداد، بانتظار الاعتماد')).toBeVisible();

  await expect.poll(() => writes(wire, 'POST').length).toBe(1);
  const posted = writes(wire, 'POST')[0];
  expect(posted).toMatchObject({
    project_id: PROJECT_ID, resource_id: RESOURCE_ID, source_kind: 'resource', vendor_name: null, category: 'equipment',
    description: 'لابتوب للمشروع', status: 'pending_review', approved_by: null, approved_at: null, receipt_attachments: [], user_id: USER_ID,
  });
  expect(Number(posted.amount)).toBe(4500);
  expect(String(posted.expense_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(claimRow(page)).toContainText('قيد المراجعة');
  await expect(claimRow(page)).toContainText('معدات وأجهزة');
  // Pending is not approved: the resource's approved balance stays at zero.
  await expect(balanceRow(page)).toContainText('0.00');
  await expect(balanceRow(page).getByRole('button', { name: 'مخالصة' })).toHaveCount(0);
});

test('approval stamps the approver and time and moves the amount into the approved balance', async ({ page }) => {
  const wire = await stubSupabase(page, { resources: [resource], resource_reimbursements: [pending] });
  await openReimbursements(page);
  await expect(balanceRow(page).getByRole('button', { name: 'مخالصة' })).toHaveCount(0);
  await claimRow(page).getByRole('button').first().click();
  await expect(page.getByText('تم الاعتماد')).toBeVisible();

  await expect.poll(() => writes(wire, 'PATCH').length).toBe(1);
  const approved = writes(wire, 'PATCH')[0];
  expect(approved).toMatchObject({ status: 'approved', approved_by: USER_ID, rejection_reason: null });
  expect(typeof approved.approved_at).toBe('string');
  await expect(claimRow(page)).toContainText('معتمد');
  await expect(balanceRow(page)).toContainText('4,000.00');
  await expect(balanceRow(page).getByRole('button', { name: 'دفع المستحقات' })).toBeVisible();
  await expect(balanceRow(page).getByRole('button', { name: 'مخالصة' })).toBeVisible();
});

test('rejection needs a written reason, writes it, and keeps the amount out of the balance', async ({ page }) => {
  const wire = await stubSupabase(page, { resources: [resource], resource_reimbursements: [pending] });
  await openReimbursements(page);
  await claimRow(page).getByRole('button').nth(1).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'سبب الرفض' })).toBeVisible();
  await dialog.getByRole('button', { name: 'رفض', exact: true }).click();
  await expect(page.getByText('سبب الرفض مطلوب')).toBeVisible();
  expect(writes(wire, 'PATCH')).toHaveLength(0);

  await dialog.getByPlaceholder('اكتب سبباً واضحاً...').fill('  بلا فاتورة  ');
  await dialog.getByRole('button', { name: 'رفض', exact: true }).click();
  await expect(page.getByText('تم الرفض')).toBeVisible();
  await expect.poll(() => writes(wire, 'PATCH').length).toBe(1);
  expect(writes(wire, 'PATCH')[0]).toMatchObject({ status: 'rejected', rejection_reason: 'بلا فاتورة', approved_by: USER_ID });
  await expect(claimRow(page)).toContainText('مرفوض');
  await expect(claimRow(page)).toContainText('السبب: بلا فاتورة');
  await expect(balanceRow(page).getByRole('button', { name: 'مخالصة' })).toHaveCount(0);
});
