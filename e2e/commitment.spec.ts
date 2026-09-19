import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Recording a contractual commitment. A commitment is money the project has
 * promised before it is spent, so the plan (400,000 in the seed) is the
 * ceiling it is measured against: a commitment past the plan may only go in
 * after an explicit confirmation, and one already spent in full must land as
 * completed, not as an open promise still counted against the plan.
 */
async function openCommitment(page: import('@playwright/test').Page, total: string, spent?: string) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'الالتزامات', exact: true }).click();
  await page.getByRole('button', { name: 'التزام جديد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('مثال: عقد توريد معدات').fill('عقد توريد معدات');
  const amounts = dialog.locator('input[type="number"]');
  await amounts.nth(0).fill(total);
  if (spent !== undefined) await amounts.nth(1).fill(spent);
  return dialog;
}
const posted = (wire: { writes: { method: string; table: string; body: unknown }[] }) => {
  const w = wire.writes.find((x) => x.table === 'commitments' && x.method === 'POST');
  if (!w) return null;
  return (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>;
};

test('records an open commitment and counts it against the plan', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openCommitment(page, '50000');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('تمت إضافة الالتزام')).toBeVisible();
  await expect(page.getByText(/نشط: 50,000\.00/)).toBeVisible();
  const row = posted(wire);
  expect(row).toMatchObject({ project_id: PROJECT_ID, description: 'عقد توريد معدات', status: 'active' });
  expect(Number(row!.total_amount)).toBe(50000);
  expect(Number(row!.spent_amount)).toBe(0);
});

test('asks before a commitment past the plan, and writes nothing when refused', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openCommitment(page, '450000');
  const prompts: string[] = [];
  page.once('dialog', (d) => { prompts.push(d.message()); void d.dismiss(); });
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect.poll(() => prompts.length).toBe(1);
  // 450,000 against a 400,000 plan: 50,000 over.
  expect(prompts[0]).toContain('50,000.00');
  await expect(dialog).toBeVisible();
  expect(posted(wire)).toBeNull();

  page.once('dialog', (d) => { void d.accept(); });
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.getByText('تمت إضافة الالتزام')).toBeVisible();
  expect(Number(posted(wire)!.total_amount)).toBe(450000);
});

test('a commitment already spent in full lands as completed', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openCommitment(page, '10000', '10000');
  await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

  await expect(page.getByText('✓ الالتزام اكتمل تلقائياً — المبلغ صُرف بالكامل')).toBeVisible();
  // The toast fires before the write leaves the browser: wait for the row.
  await expect.poll(() => posted(wire)).not.toBeNull();
  expect(posted(wire)).toMatchObject({ status: 'completed' });
  // Completed, so it no longer counts as active against the plan.
  await expect(page.getByText(/نشط: 0\.00/)).toBeVisible();
});
