import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * A risk after it is registered. Moving it to "being mitigated" keeps its
 * exposure on the books; closing it takes the exposure off while the row
 * stays on the register; deleting removes the row after a confirmation
 * that names it. The exposure and open count must follow every step.
 */
const risk = (id: string, title: string, impact: number, status: string) => ({
  id, project_id: PROJECT_ID, portfolio_id: null, user_id: USER_ID, title, description: null, probability: 'medium', impact: 'high',
  financial_impact: impact, category: 'financial', status, mitigation_plan: null, owner: null, created_at: '2026-02-01T00:00:00Z',
});
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'risks' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);
const figure = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..').locator('p').last();

async function openRisks(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'الإدارة' }).click();
  const header = page.getByRole('button', { name: 'المخاطر', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText('إجمالي التعرض المالي')).toBeVisible();
}
const rowOf = (page: Page, title: string) => page.getByRole('row').filter({ hasText: title });
async function setStatus(page: Page, title: string, from: string, to: string) {
  await rowOf(page, title).getByRole('button', { name: 'تعديل' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').filter({ hasText: from }).click();
  await page.getByRole('option', { name: to, exact: true }).click();
  await dialog.getByRole('button', { name: 'تحديث' }).click();
  // The previous update's toast may still be showing: the newest one is last.
  await expect(page.getByText('تم تحديث الخطر').last()).toBeVisible();
}

test('mitigating keeps the exposure, closing drops it, and the row stays on the register', async ({ page }) => {
  const wire = await stubSupabase(page, { risks: [risk('rk-1', 'تأخر التوريد', 25000, 'open'), risk('rk-2', 'تقلب الأسعار', 15000, 'open')] });
  await openRisks(page);
  await expect(figure(page, 'مخاطر مفتوحة')).toHaveText('2');
  await expect(figure(page, 'إجمالي التعرض المالي')).toHaveText(/^40,000\.00/);

  await setStatus(page, 'تأخر التوريد', 'مفتوح', 'قيد المعالجة');
  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toMatchObject({ status: 'mitigating', title: 'تأخر التوريد' });
  expect(Number(patches(wire)[0].financial_impact)).toBe(25000);
  await expect(figure(page, 'مخاطر مفتوحة')).toHaveText('2');
  await expect(figure(page, 'إجمالي التعرض المالي')).toHaveText(/^40,000\.00/);

  await setStatus(page, 'تأخر التوريد', 'قيد المعالجة', 'مغلق');
  await expect.poll(() => patches(wire).length).toBe(2);
  expect(patches(wire)[1]).toMatchObject({ status: 'closed' });
  await expect(figure(page, 'مخاطر مفتوحة')).toHaveText('1');
  await expect(figure(page, 'إجمالي التعرض المالي')).toHaveText(/^15,000\.00/);
  await expect(rowOf(page, 'تأخر التوريد')).toContainText('مغلق');
});

test('deleting takes the risk off at once, «تراجع» brings it back untouched, and the delete goes when the window passes', async ({ page }) => {
  const wire = await stubSupabase(page, { risks: [risk('rk-1', 'تأخر التوريد', 25000, 'open')] });
  await openRisks(page);
  await expect(figure(page, 'إجمالي التعرض المالي')).toHaveText(/^25,000\.00/);
  const del = () => rowOf(page, 'تأخر التوريد').getByRole('button', { name: 'حذف الخطر' });

  // Under load a click can land while the table re-renders; retry until the row is gone.
  await expect(async () => {
    if (await del().isVisible()) await del().click();
    await expect(page.getByText('تأخر التوريد')).toHaveCount(0, { timeout: 1000 });
  }).toPass();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(rowOf(page, 'تأخر التوريد')).toBeVisible();
  expect(wire.writes.filter((w) => w.method === 'DELETE')).toHaveLength(0);

  await del().click();
  await expect(page.getByText('حُذف الخطر').first()).toBeVisible();
  await expect(figure(page, 'مخاطر مفتوحة')).toHaveText('0');
  await expect(figure(page, 'إجمالي التعرض المالي')).toHaveText(/^0\.00/);
  await expect.poll(() => wire.writes.filter((w) => w.method === 'DELETE').map((w) => w.table), { timeout: 10_000 }).toEqual(['risks']);
});
