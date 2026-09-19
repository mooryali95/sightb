import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { FUND_ID, PROJECT_ID } from './support/seed';

/**
 * Opening a custody. A custody is cash handed to a person, and every riyal
 * of it must be traceable to a fund: the form pre-selects the newest fund
 * with a balance and writes its id on the row. An admin may open one with
 * no fund behind it, but only with a written reason, which is stamped into
 * the notes so the ledger says why the cash has no source.
 */
async function openCustodyForm(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'العهد', exact: true }).click();
  await page.getByRole('button', { name: 'عهدة جديدة' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('إضافة عهدة جديدة')).toBeVisible();
  await dialog.getByPlaceholder('مثال: عمر أحمد').fill('عمر أحمد');
  await dialog.getByPlaceholder('0').fill('5000');
  return dialog;
}
const posted = (wire: { writes: { method: string; table: string; body: unknown }[] }) => {
  const w = wire.writes.find((x) => x.table === 'custodies' && x.method === 'POST');
  if (!w) return null;
  return (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>;
};

test('opens a custody against the fund with a balance, pre-selected', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openCustodyForm(page);
  await expect(dialog.getByRole('combobox')).toContainText('دفعة #1 — متاح 38,000.00');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('تمت إضافة العهدة')).toBeVisible();
  await expect(page.getByText(/إجمالي العهد: 5,000\.00/)).toBeVisible();
  const row = posted(wire);
  expect(row, 'a custody row should have been posted').toBeTruthy();
  expect(row).toMatchObject({ project_id: PROJECT_ID, resource_name: 'عمر أحمد', status: 'active', source_fund_id: FUND_ID, notes: null });
  expect(Number(row!.amount)).toBe(5000);
});

test('an admin may leave the fund off only with a written reason, which is stamped into the notes', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openCustodyForm(page);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /بدون ربط/ }).click();
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('سبب عدم الربط بدفعة مطلوب (10 أحرف على الأقل)')).toBeVisible();
  expect(posted(wire)).toBeNull();

  await dialog.getByPlaceholder('مثال: عهدة طارئة بانتظار اعتماد دفعة جديدة').fill('قصير');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  expect(posted(wire)).toBeNull();

  await dialog.getByPlaceholder('مثال: عهدة طارئة بانتظار اعتماد دفعة جديدة').fill('عهدة طارئة بانتظار اعتماد دفعة جديدة');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('تمت إضافة العهدة')).toBeVisible();
  expect(posted(wire)).toMatchObject({ source_fund_id: null, notes: '[عهدة غير مربوطة بدفعة] عهدة طارئة بانتظار اعتماد دفعة جديدة' });
});
