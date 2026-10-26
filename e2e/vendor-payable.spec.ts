import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID } from './support/seed';

/**
 * A vendor who paid on the project's behalf. The ledger records the debt
 * under the vendor's name as an approved claim of the vendor kind, never as
 * a resource's; settling it is an approved expense out of the chosen fund,
 * bucketed by the project's month, that points back at the debt it clears.
 */
const PAYABLE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const payable = {
  id: PAYABLE_ID, project_id: PROJECT_ID, resource_id: null, source_kind: 'vendor', vendor_name: 'مؤسسة النور',
  category: 'materials', description: 'أسمنت الموقع', amount: 7000, expense_date: '2026-02-01', receipt_attachments: [],
  budget_item_id: null, status: 'approved', notes: null, rejection_reason: null, approved_by: USER_ID, approved_at: '2026-02-01T00:00:00Z',
  payment_request_id: null, settled_expense_id: null, settled_at: null, user_id: USER_ID,
  created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
};
// The seed project starts 2026-01-01 and runs 12 months; its month for today.
const projectMonth = (() => {
  const now = new Date();
  return Math.max(1, Math.min((now.getFullYear() - 2026) * 12 + now.getMonth() + 1, 12));
})();
const posts = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) =>
  wire.writes.filter((w) => w.table === table && w.method === 'POST').map((w) => w.body as Record<string, unknown>);

async function openVendors(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'مستحقات الموارد', exact: true }).click();
  await expect(page.getByText('ذمم المورّدين (دفعوا نيابة عن المشروع)')).toBeVisible();
}

test('a vendor debt is recorded approved under the vendor, never under a resource', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openVendors(page);
  await expect(page.getByText('لا توجد ذمم مورّدين مسجّلة.')).toBeVisible();
  await page.getByRole('button', { name: 'تسجيل ذمة مورد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('بيانات ناقصة').first()).toBeVisible();
  expect(posts(wire, 'resource_reimbursements')).toHaveLength(0);

  await dialog.getByPlaceholder('مثال: مؤسسة النور').fill('  مؤسسة النور ');
  await dialog.getByRole('textbox').nth(1).fill('أسمنت الموقع');
  await dialog.locator('input[type="number"]').fill('7000');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('تم تسجيل الذمة').first()).toBeVisible();

  await expect.poll(() => posts(wire, 'resource_reimbursements').length).toBe(1);
  const posted = posts(wire, 'resource_reimbursements')[0];
  expect(posted).toMatchObject({
    project_id: PROJECT_ID, source_kind: 'vendor', vendor_name: 'مؤسسة النور', resource_id: null,
    category: 'other', description: 'أسمنت الموقع', status: 'approved', approved_by: USER_ID,
  });
  expect(Number(posted.amount)).toBe(7000);
  expect(typeof posted.approved_at).toBe('string');
  const row = page.getByRole('row').filter({ hasText: 'مؤسسة النور' });
  await expect(row).toContainText('مستحقة');
  await expect(row).toContainText('7,000');
  await expect(page.getByText('مستحق: 7,000')).toBeVisible();
});

test('settling out of a fund is an approved expense on that fund pointing back at the debt', async ({ page }) => {
  const wire = await stubSupabase(page, { resource_reimbursements: [payable] });
  await openVendors(page);
  await expect(page.getByText('مستحق: 7,000')).toBeVisible();
  await page.getByRole('row').filter({ hasText: 'مؤسسة النور' }).getByRole('button', { name: 'سداد' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'سداد ذمة المورد' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'تأكيد السداد' })).toBeDisabled();

  await dialog.getByRole('combobox').filter({ hasText: 'اختر…' }).click();
  await page.getByRole('option', { name: /دفعة #1 — متبقي: 38,000/ }).click();
  await dialog.getByRole('button', { name: 'تأكيد السداد' }).click();
  await expect(page.getByText('تم السداد').first()).toBeVisible();

  await expect.poll(() => posts(wire, 'expenses').length).toBe(1);
  const expense = posts(wire, 'expenses')[0];
  expect(expense).toMatchObject({
    project_id: PROJECT_ID, category: 'materials', description: 'سداد ذمة مورد: مؤسسة النور — أسمنت الموقع',
    vendor: 'مؤسسة النور', approval_status: 'approved', is_vat_exempt: false,
    fund_id: FUND_ID, custody_id: null, reimburses_payable_id: PAYABLE_ID, month: projectMonth,
  });
  expect(Number(expense.amount)).toBe(7000);
  expect(String(expense.date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(posts(wire, 'resource_reimbursements')).toHaveLength(0);
});

test('offline, settling a vendor debt is refused, so it can never be queued and paid twice', async ({ page, context }) => {
  const wire = await stubSupabase(page, { resource_reimbursements: [payable] });
  await openVendors(page);
  await page.getByRole('row').filter({ hasText: 'مؤسسة النور' }).getByRole('button', { name: 'سداد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').filter({ hasText: 'اختر…' }).click();
  await page.getByRole('option', { name: /دفعة #1 — متبقي: 38,000/ }).click();
  await context.setOffline(true);
  await dialog.getByRole('button', { name: 'تأكيد السداد' }).click();
  await expect(page.getByText('سداد الذمة يحتاج اتصالاً').first()).toBeVisible();
  expect(posts(wire, 'expenses')).toHaveLength(0);
  await context.setOffline(false);
});
