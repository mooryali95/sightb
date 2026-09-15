import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { FUND_ID, PROJECT_ID, USER_ID } from './support/seed';

/**
 * Moving cash from a fund into a custody. The fund is 50,000 with 12,000
 * already spent against it, so 38,000 is all the manager still holds; a
 * transfer above that would hand out money the project does not have, and
 * the ledger would carry a negative fund from then on. The guard is the
 * point: the dialog must refuse with the real remainder in the message and
 * write nothing, and a transfer within it must reach the wire as typed.
 */
const CUSTODY_ID = '99999999-9999-4999-8999-999999999999';
const custody = {
  id: CUSTODY_ID, project_id: PROJECT_ID, company_id: null, resource_name: 'عهدة المشتريات', amount: 5000,
  status: 'active', notes: null, received_date: '2026-03-01', closed_date: null, source_fund_id: null, user_id: USER_ID,
  created_at: '2026-03-01T00:00:00Z',
};

async function openTransfer(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'العهد', exact: true }).click();
  await expect(page.getByText('عهدة المشتريات').first()).toBeVisible();
  await page.getByRole('button', { name: 'تحويل نقد' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('تحويل نقد من المدير إلى عهدة')).toBeVisible();
  await dialog.getByRole('combobox').filter({ hasText: 'اختر دفعة' }).click();
  await page.getByRole('option', { name: /دفعة #1 — متاح 38,000\.00/ }).click();
  await dialog.getByRole('combobox').filter({ hasText: 'اختر عهدة' }).click();
  await page.getByRole('option', { name: /عهدة المشتريات/ }).click();
  return dialog;
}

test('records a transfer within the fund\'s remainder as typed', async ({ page }) => {
  const wire = await stubSupabase(page, { custodies: [custody] });
  const dialog = await openTransfer(page);
  await dialog.getByPlaceholder('0').fill('10000');
  await dialog.getByPlaceholder('مثال: تعزيز عهدة المشتريات').fill('  تعزيز  ');
  await dialog.getByRole('button', { name: 'تسجيل التحويل' }).click();

  await expect(page.getByText('تم تسجيل تحويل النقد')).toBeVisible();
  const write = wire.writes.find((w) => w.table === 'cash_transfers' && w.method === 'POST');
  expect(write, 'a cash transfer should have been posted').toBeTruthy();
  const row = (Array.isArray(write!.body) ? write!.body[0] : write!.body) as Record<string, unknown>;
  expect(row.project_id).toBe(PROJECT_ID);
  expect(row.from_fund_id).toBe(FUND_ID);
  expect(row.to_custody_id).toBe(CUSTODY_ID);
  expect(Number(row.amount)).toBe(10000);
  expect(row.notes).toBe('تعزيز');
});

test('refuses a transfer above what the fund still holds, naming the remainder', async ({ page }) => {
  const wire = await stubSupabase(page, { custodies: [custody] });
  const dialog = await openTransfer(page);
  await dialog.getByPlaceholder('0').fill('38001');
  await dialog.getByRole('button', { name: 'تسجيل التحويل' }).click();

  await expect(page.getByText('المبلغ يتجاوز رصيد الدفعة المتاح (38,000.00 ر.س)')).toBeVisible();
  expect(wire.writes.filter((w) => w.table === 'cash_transfers')).toHaveLength(0);
});
