import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID, seed } from './support/seed';

/**
 * A portfolio: created under a company, then given a revenue target that
 * the page measures collected revenue against. Creation must land the
 * portfolio on the right company with zero targets; the edit must write
 * exactly the typed targets, and the achievement bar must divide what the
 * portfolio's projects collected by the target just saved.
 */
const PORTFOLIO_ID = '77777777-7777-4777-8777-777777777700';
const P2_ID = '66666666-6666-4666-8666-666666666600';
const rows = {
  portfolios: [{ id: PORTFOLIO_ID, company_id: COMPANY_ID, user_id: USER_ID, name: 'محفظة التطوير', description: null, target_revenue: 0, target_margin: 0, fiscal_year: null, notes: null, created_at: '2026-01-01T00:00:00Z' }],
  projects: [{ ...seed.projects[0], id: P2_ID, portfolio_id: PORTFOLIO_ID, name: 'مشروع المحفظة' }],
  revenues: [
    { id: 'rv-1', project_id: P2_ID, user_id: USER_ID, description: 'دفعة محصّلة', amount: 300000, date: '2026-03-01', month: 3, revenue_type: 'milestone', status: 'collected', invoice_number: null, invoice_date: null, collection_date: '2026-03-05', milestone_id: null, created_at: '2026-03-01T00:00:00Z' },
    { id: 'rv-2', project_id: P2_ID, user_id: USER_ID, description: 'دفعة مخطّطة', amount: 200000, date: '2026-06-01', month: 6, revenue_type: 'milestone', status: 'planned', invoice_number: null, invoice_date: null, collection_date: null, milestone_id: null, created_at: '2026-03-01T00:00:00Z' },
  ],
};
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, method: string) =>
  wire.writes.filter((w) => w.table === 'portfolios' && w.method === method).map((w) => w.body as Record<string, unknown>);

test('creating a portfolio needs a company and lands it under that company with zero targets', async ({ page }) => {
  const wire = await stubSupabase(page);
  await page.goto('/portfolio/new');
  await expect(page.getByRole('heading', { name: 'إضافة محفظة جديدة' })).toBeVisible();
  await page.getByPlaceholder('مثال: مشاريع التطوير التربوي').fill('  محفظة التطوير  ');
  await page.getByRole('button', { name: 'إضافة المحفظة' }).click();
  await expect(page.getByText('يرجى اختيار الشركة')).toBeVisible();
  expect(writes(wire, 'POST')).toHaveLength(0);

  await page.getByRole('combobox').filter({ hasText: 'اختر الشركة' }).click();
  await page.getByRole('option', { name: 'شركة الاختبار' }).click();
  await page.getByRole('button', { name: 'إضافة المحفظة' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => writes(wire, 'POST').length).toBe(1);
  const posted = writes(wire, 'POST')[0];
  expect(posted).toMatchObject({ user_id: USER_ID, company_id: COMPANY_ID, name: 'محفظة التطوير', description: null, fiscal_year: null, notes: null });
  expect(Number(posted.target_revenue)).toBe(0);
  expect(Number(posted.target_margin)).toBe(0);
});

test('editing writes the typed targets and the page measures collected revenue against them', async ({ page }) => {
  const wire = await stubSupabase(page, rows);
  await page.goto(`/portfolio/${PORTFOLIO_ID}`);
  await expect(page.getByText('محفظة التطوير').first()).toBeVisible();
  await expect(page.getByText('هدف الإيراد المحصّل')).toHaveCount(0);
  await page.getByRole('button', { name: 'تعديل' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'تعديل بيانات المحفظة' })).toBeVisible();

  await dialog.getByRole('textbox').first().fill('   ');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('اسم المحفظة مطلوب')).toBeVisible();
  expect(writes(wire, 'PATCH')).toHaveLength(0);

  await dialog.getByRole('textbox').first().fill('  محفظة التطوير  ');
  await dialog.locator('input[type="number"]').nth(0).fill('500000');
  await dialog.locator('input[type="number"]').nth(1).fill('20');
  await dialog.getByPlaceholder('مثال: 2026').fill('2026');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('تم تحديث بيانات المحفظة')).toBeVisible();

  await expect.poll(() => writes(wire, 'PATCH').length).toBe(1);
  const patch = writes(wire, 'PATCH')[0];
  expect(patch).toMatchObject({ name: 'محفظة التطوير', fiscal_year: '2026', description: null });
  expect(Number(patch.target_revenue)).toBe(500000);
  expect(Number(patch.target_margin)).toBe(20);
  expect(patch).not.toHaveProperty('company_id');

  // 300,000 collected of the portfolio's project; the planned 200,000 does not count.
  await expect(page.getByText('هدف الإيراد المحصّل')).toBeVisible();
  await expect(page.getByText(/300,000\.00 ر\.س \/ 500,000\.00/)).toBeVisible();
  await expect(page.getByText('60.0% من المستهدف')).toBeVisible();
});
