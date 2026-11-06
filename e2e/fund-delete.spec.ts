import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, FUND_ID, USER_ID, seed } from './support/seed';

/**
 * Deleting a fund. The rows that drew on it are not the fund's to take
 * with it: the confirmation names how many expenses and custodies are
 * linked and for how much, and the deletion first unlinks both, then
 * removes the fund row, and never a settled fund at all.
 */
const CUSTODY_ID = '99999999-9999-4999-8999-999999999901';
const custody = {
  id: CUSTODY_ID, project_id: PROJECT_ID, company_id: seed.projects[0].company_id, resource_id: null, resource_name: 'عهدة الموقع',
  amount: 8000, date: '2026-02-10', status: 'active', source_fund_id: FUND_ID, notes: null, closed_date: null,
  user_id: USER_ID, created_at: '2026-02-10T00:00:00Z',
};
const byMethod = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => ['PATCH', 'DELETE'].includes(w.method)).map((w) => `${w.method} ${w.table}`);
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) =>
  wire.writes.filter((w) => w.table === table && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

async function openFunds(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'الدفعات', exact: true }).click();
  await expect(page.getByText('سجل الدفعات')).toBeVisible();
}
const fundRow = (page: Page, number = 1) => page.getByRole('row').filter({ has: page.getByRole('cell', { name: `#${number}`, exact: true }) }).first();
// The delete control is an unlabeled icon button; the settlement button beside it appears once settlements load.
const deleteButton = (page: Page) => fundRow(page).locator('button', { has: page.locator('svg.text-destructive') });

test('the confirmation names the linked rows, and deleting unlinks them before the fund goes', async ({ page }) => {
  const wire = await stubSupabase(page, { custodies: [custody] });
  await openFunds(page);
  await deleteButton(page).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'حذف الدفعة' })).toBeVisible();
  // The seed's 12,000 expense and the appended 8,000 custody draw on fund #1.
  await expect(confirm).toContainText('حذف الدفعة #1؟ سيتم فك ربط مصروف واحد (12,000.00 ر.س) و1 عهدة (8,000.00 ر.س) — البنود نفسها لن تُحذف.');
  await confirm.getByRole('button', { name: 'إلغاء' }).click();
  expect(byMethod(wire)).toEqual([]);

  await deleteButton(page).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByText('تم الحذف')).toBeVisible();
  await expect.poll(() => byMethod(wire).length).toBe(3);
  expect(byMethod(wire)).toEqual(['PATCH expenses', 'PATCH custodies', 'DELETE project_funds']);
  expect(patches(wire, 'expenses')[0]).toStrictEqual({ fund_id: null });
  expect(patches(wire, 'custodies')[0]).toStrictEqual({ source_fund_id: null });
  await expect(page.getByRole('cell', { name: '#1', exact: true })).toHaveCount(0);
});

test('a settled fund offers no deletion', async ({ page }) => {
  const settledId = '33333333-3333-4333-8333-333333333302';
  const wire = await stubSupabase(page, {
    project_funds: [{ ...seed.project_funds[0], id: settledId, fund_number: 2, status: 'settled', amount: 20000 }],
  });
  await openFunds(page);
  const settled = fundRow(page, 2);
  await expect(settled).toBeVisible();
  // Only the inspector is left on a settled fund: no delete control.
  await expect(settled.locator('button', { has: page.locator('svg.text-destructive') })).toHaveCount(0);
  await expect(settled.getByRole('button', { name: 'عرض التفاصيل' })).toBeVisible();
  // Fund #1, still open, keeps its delete control.
  await deleteButton(page).click();
  await expect(page.getByRole('alertdialog').getByRole('heading', { name: 'حذف الدفعة' })).toBeVisible();
  expect(byMethod(wire)).toEqual([]);
});
