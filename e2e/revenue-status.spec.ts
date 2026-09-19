import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * A revenue moving through its life: planned, then invoiced with an invoice
 * number and date, then collected with a collection date. Each step must
 * write exactly the fields that status carries and clear the ones it does
 * not, and the section's four totals must move the amount with it, since
 * the receivable and the realised margin both read them.
 */
test.use({ viewport: { width: 1280, height: 1800 } });

const REV_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const planned = {
  id: REV_ID, project_id: PROJECT_ID, user_id: USER_ID, description: 'الدفعة الأولى', amount: 300000, date: '2026-03-01',
  month: 3, revenue_type: 'milestone', status: 'planned', invoice_number: null, invoice_date: null, collection_date: null,
  milestone_id: null, created_at: '2026-01-01T00:00:00Z',
};
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'revenues' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);
// The four summary cards; the same words also appear as row badges, so scope to the card.
const total = (page: Page, label: string) => page.locator('div.text-center').filter({ has: page.getByText(label, { exact: true }) }).locator('p').last();

async function openRevenue(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الإيرادات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText('الدفعة الأولى')).toBeVisible();
}
async function editRow(page: Page) {
  await page.getByRole('row').filter({ hasText: 'الدفعة الأولى' }).getByRole('button').nth(1).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'تعديل الإيراد' })).toBeVisible();
  return dialog;
}
async function pickStatus(page: Page, dialog: ReturnType<Page['getByRole']>, from: string, to: string) {
  await dialog.getByRole('combobox').filter({ hasText: from }).click();
  await page.getByRole('option', { name: to, exact: true }).click();
}

test('planned to invoiced to collected: each step writes its own fields and moves the totals', async ({ page }) => {
  const wire = await stubSupabase(page, { revenues: [planned] });
  await openRevenue(page);
  await expect(total(page, 'مخطط')).toHaveText(/^300,000\.00 /);
  await expect(total(page, 'مُفوتر')).toHaveText(/^0\.00 /);

  let dialog = await editRow(page);
  await pickStatus(page, dialog, 'مخطط', 'مُفوتر');
  await dialog.getByPlaceholder('INV-001').fill('INV-2026-07');
  await dialog.locator('input[type="date"]').nth(1).fill('2026-07-01');
  await dialog.getByRole('button', { name: /حفظ/ }).click();
  await expect(page.getByText('تم تعديل الإيراد')).toBeVisible();
  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toMatchObject({ status: 'invoiced', invoice_number: 'INV-2026-07', invoice_date: '2026-07-01', collection_date: null, milestone_id: null, description: 'الدفعة الأولى' });
  expect(Number(patches(wire)[0].amount)).toBe(300000);
  await expect(total(page, 'مُفوتر')).toHaveText(/^300,000\.00 /);
  await expect(total(page, 'غير محصّل')).toHaveText(/^300,000\.00 /);
  await expect(total(page, 'مخطط')).toHaveText(/^0\.00 /);
  await expect(total(page, 'محصّل')).toHaveText(/^0\.00 /);

  dialog = await editRow(page);
  await pickStatus(page, dialog, 'مُفوتر', 'محصّل');
  await dialog.locator('input[type="date"]').nth(2).fill('2026-07-15');
  await dialog.getByRole('button', { name: /حفظ/ }).click();
  await expect.poll(() => patches(wire).length).toBe(2);
  expect(patches(wire)[1]).toMatchObject({ status: 'collected', invoice_number: 'INV-2026-07', invoice_date: '2026-07-01', collection_date: '2026-07-15' });
  await expect(total(page, 'محصّل')).toHaveText(/^300,000\.00 /);
  await expect(total(page, 'مُفوتر')).toHaveText(/^0\.00 /);
  await expect(total(page, 'غير محصّل')).toHaveText(/^0\.00 /);
});

test('back to planned clears the invoice and collection fields', async ({ page }) => {
  const wire = await stubSupabase(page, { revenues: [{ ...planned, status: 'collected', invoice_number: 'INV-1', invoice_date: '2026-03-01', collection_date: '2026-03-10' }] });
  await openRevenue(page);
  await expect(total(page, 'محصّل')).toHaveText(/^300,000\.00 /);
  const dialog = await editRow(page);
  await pickStatus(page, dialog, 'محصّل', 'مخطط');
  await expect(dialog.getByPlaceholder('INV-001')).toHaveCount(0);
  await dialog.getByRole('button', { name: /حفظ/ }).click();
  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toMatchObject({ status: 'planned', invoice_number: null, invoice_date: null, collection_date: null });
  await expect(total(page, 'مخطط')).toHaveText(/^300,000\.00 /);
  await expect(total(page, 'محصّل')).toHaveText(/^0\.00 /);
});
