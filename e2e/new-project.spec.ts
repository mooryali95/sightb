import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID } from './support/seed';

/**
 * Creating a project. The contract value is the figure every later ratio
 * divides by, and the row stores it net of VAT: a value typed as inclusive
 * of 15% must land stripped of the tax, a value typed as exclusive must
 * land as typed, and a project with no company or no value never leaves
 * the browser.
 */
const posted = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'projects' && w.method === 'POST').map((w) => w.body as Record<string, unknown>);

async function fillProject(page: import('@playwright/test').Page, query: string) {
  await page.goto(`/project/new${query}`);
  await expect(page.getByRole('heading', { name: 'إنشاء مشروع جديد' })).toBeVisible();
  await page.getByPlaceholder('مثال: مشروع الرواد — ألبانيا 2026').fill('مشروع الرواد');
  await page.getByPlaceholder('230,000').fill('230000');
}

test('a VAT-inclusive contract is stored net of the tax', async ({ page }) => {
  const wire = await stubSupabase(page);
  await fillProject(page, `?company=${COMPANY_ID}`);
  await page.getByRole('button', { name: 'شاملة الضريبة' }).click();
  await expect(page.getByText('200,000.00')).toBeVisible();
  await expect(page.getByText(/^30,000\.00/)).toBeVisible();
  // number inputs, in page order: contract value, retention, VAT, duration, headcount.
  await page.locator('input[type="number"]').nth(3).fill('10');
  await page.getByRole('button', { name: 'إنشاء المشروع' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => posted(wire).length).toBe(1);
  const row = posted(wire)[0];
  expect(row).toMatchObject({
    user_id: USER_ID, company_id: COMPANY_ID, portfolio_id: null, name: 'مشروع الرواد', status: 'planning',
    currency: 'SAR', contract_type: 'lump_sum', duration_months: 10, resource_count: 1, vat_inclusive: false,
  });
  expect(Number(row.contract_value)).toBe(200000);
  expect(Number(row.tax_percent)).toBe(15);
  expect(Number(row.retention_percent)).toBe(0);
});

test('a VAT-exclusive contract is stored as typed', async ({ page }) => {
  const wire = await stubSupabase(page);
  await fillProject(page, `?company=${COMPANY_ID}`);
  await expect(page.getByText('264,500.00')).toBeVisible();
  await page.getByRole('button', { name: 'إنشاء المشروع' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => posted(wire).length).toBe(1);
  expect(Number(posted(wire)[0].contract_value)).toBe(230000);
  expect(posted(wire)[0].duration_months).toBe(4);
});

test('no company, then no value, are each refused before the wire', async ({ page }) => {
  const wire = await stubSupabase(page);
  await fillProject(page, '');
  await page.getByRole('button', { name: 'إنشاء المشروع' }).click();
  await expect(page.getByText('يرجى اختيار الشركة')).toBeVisible();
  expect(posted(wire)).toHaveLength(0);

  await page.getByRole('combobox').filter({ hasText: 'اختر الشركة' }).click();
  await page.getByRole('option', { name: 'شركة الاختبار' }).click();
  await page.getByPlaceholder('230,000').fill('0');
  await page.getByRole('button', { name: 'إنشاء المشروع' }).click();
  await expect(page.getByText('قيمة العقد يجب أن تكون أكبر من صفر')).toBeVisible();
  expect(posted(wire)).toHaveLength(0);
  await expect(page).toHaveURL(/\/project\/new$/);
});
