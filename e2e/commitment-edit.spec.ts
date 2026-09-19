import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * A commitment after it is recorded. Only active commitments hold plan
 * money: editing the spend up to the total completes the commitment on
 * its own and releases the plan; cancelling releases it too, with the
 * row kept. The four figures must move with every write.
 */
const commitment = (over: Record<string, unknown> = {}) => ({
  id: 'cm-1', project_id: PROJECT_ID, user_id: USER_ID, description: 'عقد توريد معدات', vendor_name: 'مؤسسة النور',
  contract_ref: 'C-100', total_amount: 100000, spent_amount: 30000, status: 'active', notes: null, budget_item_id: null,
  created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', ...over,
});
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'commitments' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);
const figure = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..').locator('p').last();

async function openCommitments(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  const header = page.getByRole('button', { name: 'الالتزامات', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText('إجمالي الالتزامات')).toBeVisible();
}
async function editCommitment(page: Page) {
  await page.getByRole('row').filter({ hasText: 'عقد توريد معدات' }).getByRole('button', { name: 'تعديل' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'حفظ التعديلات' })).toBeVisible();
  return dialog;
}

test('spending the whole commitment completes it on its own and releases the plan', async ({ page }) => {
  const wire = await stubSupabase(page, { commitments: [commitment()] });
  await openCommitments(page);
  // 100,000 committed of the 400,000 plan, 30,000 of it spent.
  await expect(figure(page, 'إجمالي الالتزامات')).toHaveText(/^100,000\.00/);
  await expect(figure(page, 'المصروف')).toHaveText(/^30,000\.00/);
  await expect(figure(page, 'متبقي من الالتزامات')).toHaveText(/^70,000\.00/);
  await expect(figure(page, 'المتاح من الموازنة')).toHaveText(/^300,000\.00/);

  const dialog = await editCommitment(page);
  await dialog.locator('input[type="number"]').nth(1).fill('100000');
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('✓ الالتزام اكتمل تلقائياً — المبلغ صُرف بالكامل')).toBeVisible();
  await expect(page.getByText('تم تعديل الالتزام')).toBeVisible();

  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toMatchObject({ status: 'completed', description: 'عقد توريد معدات', vendor_name: 'مؤسسة النور', contract_ref: 'C-100' });
  expect(Number(patches(wire)[0].spent_amount)).toBe(100000);
  expect(Number(patches(wire)[0].total_amount)).toBe(100000);
  await expect(page.getByRole('row').filter({ hasText: 'عقد توريد معدات' })).toContainText('مكتمل');
  await expect(figure(page, 'إجمالي الالتزامات')).toHaveText(/^0\.00/);
  await expect(figure(page, 'المتاح من الموازنة')).toHaveText(/^400,000\.00/);
});

test('cancelling releases the plan and keeps the row', async ({ page }) => {
  const wire = await stubSupabase(page, { commitments: [commitment()] });
  await openCommitments(page);
  const dialog = await editCommitment(page);
  await dialog.getByRole('combobox').filter({ hasText: 'نشط' }).click();
  await page.getByRole('option', { name: 'ملغي', exact: true }).click();
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('تم تعديل الالتزام')).toBeVisible();

  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toMatchObject({ status: 'cancelled' });
  expect(Number(patches(wire)[0].spent_amount)).toBe(30000);
  await expect(page.getByRole('row').filter({ hasText: 'عقد توريد معدات' })).toContainText('ملغي');
  await expect(figure(page, 'إجمالي الالتزامات')).toHaveText(/^0\.00/);
  await expect(figure(page, 'المصروف')).toHaveText(/^0\.00/);
  await expect(figure(page, 'المتاح من الموازنة')).toHaveText(/^400,000\.00/);
});
