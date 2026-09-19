import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * A plan line after it is written. Editing its amount rewrites the plan
 * total at once; deleting takes it out; and once a baseline has locked
 * the plan, neither control exists until an amendment is open.
 */
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'budget_items' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);
const baseline = { cost_baselines: [{ id: 'bl-1', project_id: PROJECT_ID, user_id: USER_ID, name: 'الخطة المعتمدة', version: 1, is_active: true, total_planned: 400000, created_at: '2026-02-01T00:00:00Z' }] };
const draft = { budget_amendments: [{ id: 'am-1', project_id: PROJECT_ID, user_id: USER_ID, reason: 'تصحيح', snapshot_before: [], snapshot_after: null, total_before: 400000, total_after: null, status: 'draft', approved_by: null, approved_at: null, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' }] };

async function openBudget(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الموازنة', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText(/الإجمالي المخطط: 400,000\.00/)).toBeVisible();
}
const row = (page: Page) => page.getByRole('row').filter({ hasText: 'بند المواد' });

test('editing the amount rewrites the plan total, and deleting takes the line out', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openBudget(page);
  await row(page).getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'حفظ التعديلات' })).toBeVisible();
  await expect(dialog.locator('input[type="number"]').first()).toHaveValue('400000');
  await dialog.locator('input[type="number"]').first().fill('350000');
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('تم تعديل بند الموازنة')).toBeVisible();
  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toMatchObject({ category: 'materials', description: 'بند المواد', cost_type: 'fixed' });
  expect(Number(patches(wire)[0].planned_amount)).toBe(350000);
  await expect(page.getByText(/الإجمالي المخطط: 350,000\.00/)).toBeVisible();

  await row(page).locator('button', { has: page.locator('svg.text-destructive') }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'حذف بند الموازنة' })).toBeVisible();
  await confirm.getByRole('button', { name: 'حذف' }).click();
  await expect.poll(() => wire.writes.filter((w) => w.method === 'DELETE').map((w) => w.table)).toEqual(['budget_items']);
  await expect(row(page)).toHaveCount(0);
  await expect(page.getByText(/الإجمالي المخطط: 0\.00/)).toBeVisible();
});

test('a baseline locks every control on the plan until an amendment is open', async ({ page }) => {
  await stubSupabase(page, baseline);
  await openBudget(page);
  await expect(page.getByText('الموازنة مقفلة بخط الأساس.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'بند جديد' })).toHaveCount(0);
  await expect(row(page).getByRole('button')).toHaveCount(0);
});

test('an open amendment gives the controls back', async ({ page }) => {
  const wire = await stubSupabase(page, { ...baseline, ...draft });
  await openBudget(page);
  await expect(page.getByText('الموازنة مفتوحة للتعديل الآن')).toBeVisible();
  await expect(page.getByRole('button', { name: 'بند جديد' })).toBeVisible();
  await expect(row(page).getByRole('button')).toHaveCount(2);
  await row(page).getByRole('button').first().click();
  await page.getByRole('dialog').locator('input[type="number"]').first().fill('420000');
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect.poll(() => patches(wire).length).toBe(1);
  expect(Number(patches(wire)[0].planned_amount)).toBe(420000);
  await expect(page.getByText(/الإجمالي المخطط: 420,000\.00/)).toBeVisible();
});
