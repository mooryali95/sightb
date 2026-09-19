import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Freezing the plan into a baseline. Earned value is measured against the
 * active baseline, so a new one must copy the plan as it stands (the seed's
 * one item of 400,000), carry the plan total, take the next version number,
 * and become the only active baseline: the previous one has to be
 * deactivated in the same operation, or two baselines would both claim to
 * be the truth.
 */
async function openBaseline(page: import('@playwright/test').Page, name: string) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'خط الأساس', exact: true }).click();
  await page.getByRole('button', { name: 'خط أساس جديد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder(/Baseline/).fill(name);
  await dialog.getByRole('button', { name: 'إنشاء خط الأساس' }).click();
  await expect(page.getByText('تم إنشاء خط الأساس بنجاح')).toBeVisible();
}
const rows = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string, method: string) =>
  wire.writes.filter((w) => w.table === table && w.method === method).map((w) => w.body);

test('the first baseline copies the plan, carries its total, and is version 1 and active', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openBaseline(page, 'الخطة المعتمدة');

  await expect.poll(() => rows(wire, 'baseline_items', 'POST').length).toBe(1);
  const baseline = (rows(wire, 'cost_baselines', 'POST')[0] as Record<string, unknown>[] | Record<string, unknown>);
  const bl = (Array.isArray(baseline) ? baseline[0] : baseline) as Record<string, unknown>;
  expect(bl).toMatchObject({ project_id: PROJECT_ID, user_id: USER_ID, name: 'الخطة المعتمدة', version: 1, is_active: true });
  expect(Number(bl.total_planned)).toBe(400000);
  const items = rows(wire, 'baseline_items', 'POST')[0] as Record<string, unknown>[];
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ category: 'materials', description: 'بند المواد', cost_type: 'fixed' });
  expect(Number(items[0].planned_amount)).toBe(400000);
  expect(rows(wire, 'cost_baselines', 'PATCH')).toHaveLength(0);
  await expect(page.getByText('تفاصيل خط الأساس النشط: الخطة المعتمدة')).toBeVisible();
});

test('a second baseline takes the next version and retires the first', async ({ page }) => {
  const wire = await stubSupabase(page, {
    cost_baselines: [{ id: 'bl-1', project_id: PROJECT_ID, user_id: USER_ID, name: 'الأولى', version: 1, is_active: true, total_planned: 400000, created_at: '2026-02-01T00:00:00Z' }],
    baseline_items: [{ id: 'bi-1', baseline_id: 'bl-1', category: 'materials', description: 'بند المواد', planned_amount: 400000, month: null, start_month: null, end_month: null, cost_type: 'fixed' }],
  });
  await openBaseline(page, 'الثانية');

  await expect.poll(() => rows(wire, 'baseline_items', 'POST').length).toBe(1);
  const retire = rows(wire, 'cost_baselines', 'PATCH');
  expect(retire).toHaveLength(1);
  expect(retire[0]).toMatchObject({ is_active: false });
  const created = rows(wire, 'cost_baselines', 'POST')[0];
  const bl = (Array.isArray(created) ? created[0] : created) as Record<string, unknown>;
  expect(bl).toMatchObject({ name: 'الثانية', version: 2, is_active: true });
});
