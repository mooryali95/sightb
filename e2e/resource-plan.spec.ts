import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Adding a person to the project. A resource with a monthly cost is a
 * recurring plan line waiting to be written, so the form offers to write it:
 * the offer must quote the cost times the project's months, and accepting
 * it must land a recurring salary item over the whole duration linked to
 * the new resource. Declining must write nothing beyond the resource.
 */
async function addResource(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'التخطيط' }).click();
  await page.getByRole('button', { name: 'الموارد', exact: true }).click();
  await page.getByRole('button', { name: /مورد جديد|إضافة مورد/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('مثال: أحمد محمد').fill('ليلى');
  await dialog.getByPlaceholder('مثال: مدير مشروع').fill('مهندسة');
  await dialog.locator('input[type="number"]').fill('9000');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('تمت إضافة المورد')).toBeVisible();
  const prompt = page.getByRole('dialog').filter({ hasText: 'إنشاء بند موازنة؟' });
  await expect(prompt).toBeVisible();
  // 9,000 a month over the seed project's 12 months.
  await expect(prompt.getByText('9,000.00 ر.س × 12 شهر = 108,000.00 ر.س')).toBeVisible();
  return prompt;
}
const rowOf = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string) => {
  const w = wire.writes.find((x) => x.table === table && x.method === 'POST');
  if (!w) return null;
  return (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>;
};

test('accepting the offer writes a recurring salary line over the whole project, linked to the resource', async ({ page }) => {
  const wire = await stubSupabase(page);
  const prompt = await addResource(page);
  await prompt.getByRole('button', { name: 'نعم — أنشئ البند' }).click();
  await expect(page.getByText('تم إنشاء بند الموازنة')).toBeVisible();

  const resource = rowOf(wire, 'resources');
  expect(resource).toMatchObject({ project_id: PROJECT_ID, name: 'ليلى', role: 'مهندسة' });
  expect(Number(resource!.monthly_cost)).toBe(9000);
  await expect.poll(() => rowOf(wire, 'budget_items')).not.toBeNull();
  const item = rowOf(wire, 'budget_items')!;
  expect(item).toMatchObject({ project_id: PROJECT_ID, category: 'salary', description: 'ليلى — مهندسة', cost_type: 'recurring', start_month: 1, end_month: 12 });
  expect(Number(item.planned_amount)).toBe(9000);
  expect(typeof item.resource_id).toBe('string');
  expect(item.resource_id).not.toBeNull();
});

test('declining the offer leaves the plan alone', async ({ page }) => {
  const wire = await stubSupabase(page);
  const prompt = await addResource(page);
  await prompt.getByRole('button', { name: 'لا — يدوياً لاحقاً' }).click();
  await expect(prompt).not.toBeVisible();
  expect(rowOf(wire, 'resources')).not.toBeNull();
  expect(rowOf(wire, 'budget_items')).toBeNull();
  await expect(page.getByText(/التكلفة الشهرية: 9,000\.00/)).toBeVisible();
});
