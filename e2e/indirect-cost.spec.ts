import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID } from './support/seed';

/**
 * Indirect costs recorded the older way. Company spend is now recorded once,
 * as a company expense, so no new indirect cost can be added; those left
 * are listed with their total until deleted, and the card goes with the last.
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

test('company spend is recorded once: no indirect-cost form, and no card while none are left', async ({ page }) => {
  const wire = await stubSupabase(page);
  await page.goto(`/company/${COMPANY_ID}`);
  await expect(page.getByText('شركة الاختبار').first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(rows(wire, 'indirect_costs', 'POST')).toHaveLength(0);
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
