import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Asking for the next fund. The rule that keeps the ledger honest is that no
 * new fund is raised while the previous one is unsettled: the seed fund #1
 * is acknowledged with a draft settlement, so the ordinary button must be
 * disabled and the reason shown. An admin may override it as an emergency,
 * but only with a written reason of ten characters or more, which is
 * stamped into the notes; the new fund must be numbered after the last.
 */
async function openFunds(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'الدفعات', exact: true }).click();
  await expect(page.getByText('سجل الدفعات')).toBeVisible();
}
const posted = (wire: { writes: { method: string; table: string; body: unknown }[] }) => {
  const w = wire.writes.find((x) => x.table === 'project_funds' && x.method === 'POST');
  if (!w) return null;
  return (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>;
};

test('holds the next fund while the previous one is unsettled', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openFunds(page);
  await expect(page.getByRole('button', { name: /دفعة جديدة/ })).toBeDisabled();
  await expect(page.getByText(/الدفعة رقم 1/)).toBeVisible();
  expect(posted(wire)).toBeNull();
});

test('an admin raises an emergency fund only with a written reason, numbered after the last', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openFunds(page);
  await page.getByRole('button', { name: /استثنائية/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('دفعة استثنائية (تجاوز قاعدة التسوية)')).toBeVisible();
  await dialog.getByPlaceholder('0').fill('20000');
  await dialog.getByPlaceholder(/مدفوعات عاجلة/).fill('قصير');
  await dialog.getByRole('button', { name: 'اعتماد الدفعة الاستثنائية' }).click();
  await expect(page.getByText('سبب الدفعة الاستثنائية مطلوب (10 أحرف على الأقل)')).toBeVisible();
  expect(posted(wire)).toBeNull();

  await dialog.getByPlaceholder(/مدفوعات عاجلة/).fill('مدفوعات عاجلة لمورد حرج');
  await dialog.getByRole('button', { name: 'اعتماد الدفعة الاستثنائية' }).click();
  await expect(page.getByText('تم إنشاء الدفعة الاستثنائية وتسجيلها في سجل التدقيق')).toBeVisible();
  await expect.poll(() => posted(wire)).not.toBeNull();
  const row = posted(wire)!;
  expect(row).toMatchObject({ project_id: PROJECT_ID, fund_number: 2 });
  expect(Number(row.amount)).toBe(20000);
  expect(String(row.notes)).toMatch(/^\[دفعة استثنائية\] مدفوعات عاجلة لمورد حرج/);
});
