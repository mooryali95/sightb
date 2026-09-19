import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID } from './support/seed';

/**
 * The company's overhead. Indirect costs are not tied to a project, so they
 * live on the company page and are spread over its projects later; what
 * matters here is that a new cost is written against the right company with
 * the category, month and amount typed, that a blank description never
 * reaches the database, and that deleting one takes it out of the total.
 */
const INDIRECT = 'التكاليف غير المباشرة';
const card = (page: import('@playwright/test').Page) => page.locator('.stat-card', { hasText: INDIRECT });
const rows = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string, method: string) =>
  wire.writes.filter((w) => w.table === table && w.method === method).map((w) => w.body);

async function openCompany(page: import('@playwright/test').Page) {
  await page.goto(`/company/${COMPANY_ID}`);
  await expect(page.getByText('شركة الاختبار').first()).toBeVisible();
  await expect(card(page)).toBeVisible();
}

test('adding a rent cost writes it against the company and lifts the overhead total', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openCompany(page);
  await expect(card(page).getByText('لا توجد تكاليف غير مباشرة')).toBeVisible();

  await card(page).getByRole('button', { name: 'إضافة' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'إضافة تكلفة غير مباشرة' })).toBeVisible();

  // A blank description is refused before any write.
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('الوصف مطلوب')).toBeVisible();
  expect(rows(wire, 'indirect_costs', 'POST')).toHaveLength(0);

  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'إيجار' }).click();
  await dialog.getByPlaceholder('وصف التكلفة').fill('إيجار المكتب الرئيسي');
  const numbers = dialog.locator('input[type="number"]');
  await numbers.nth(0).fill('24000');
  await numbers.nth(1).fill('3');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('تم إضافة التكلفة')).toBeVisible();

  await expect.poll(() => rows(wire, 'indirect_costs', 'POST').length).toBe(1);
  const posted = rows(wire, 'indirect_costs', 'POST')[0] as Record<string, unknown>;
  expect(posted).toMatchObject({
    company_id: COMPANY_ID, user_id: USER_ID, category: 'rent',
    description: 'إيجار المكتب الرئيسي', month: 3, allocation_method: 'equal',
  });
  expect(Number(posted.amount)).toBe(24000);

  const row = card(page).getByRole('row').filter({ hasText: 'إيجار المكتب الرئيسي' });
  await expect(row).toContainText('إيجار');
  await expect(row).toContainText('24,000.00');
  await expect(row).toContainText('شهر 3');
  await expect(card(page).getByText(/24,000\.00/).last()).toBeVisible();
});

test('deleting a cost asks first, then drops it from the list and the total', async ({ page }) => {
  const base = { company_id: COMPANY_ID, user_id: USER_ID, date: '2026-02-01', allocation_method: 'equal', created_at: '2026-02-01T00:00:00Z' };
  const wire = await stubSupabase(page, {
    indirect_costs: [
      { id: 'ic-1', ...base, category: 'utilities', description: 'كهرباء المستودع', amount: 5000, month: 2 },
      { id: 'ic-2', ...base, category: 'insurance', description: 'تأمين المعدات', amount: 3000, month: 2 },
    ],
  });
  await openCompany(page);
  await expect(card(page).getByText(/8,000\.00/)).toBeVisible();

  await card(page).getByRole('row').filter({ hasText: 'كهرباء المستودع' }).getByRole('button').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'حذف التكلفة' })).toBeVisible();
  await expect(confirm).toContainText('هل أنت متأكد من حذف "كهرباء المستودع"؟');

  // Backing out deletes nothing.
  await confirm.getByRole('button', { name: 'إلغاء' }).click();
  await expect(confirm).toBeHidden();
  expect(rows(wire, 'indirect_costs', 'DELETE')).toHaveLength(0);
  await expect(card(page).getByRole('row').filter({ hasText: 'كهرباء المستودع' })).toBeVisible();

  await card(page).getByRole('row').filter({ hasText: 'كهرباء المستودع' }).getByRole('button').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByText('تم الحذف')).toBeVisible();

  await expect.poll(() => rows(wire, 'indirect_costs', 'DELETE').length).toBe(1);
  await expect(card(page).getByRole('row').filter({ hasText: 'كهرباء المستودع' })).toHaveCount(0);
  await expect(card(page).getByRole('row').filter({ hasText: 'تأمين المعدات' })).toBeVisible();
  await expect(card(page).getByText(/3,000\.00/).last()).toBeVisible();
  await expect(card(page).getByText(/8,000\.00/)).toHaveCount(0);
});
