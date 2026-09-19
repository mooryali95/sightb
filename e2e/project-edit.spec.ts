import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Editing the project's own figures. The contract value is the divisor of
 * every spend ratio and the duration is the width of every monthly plan,
 * so a save must write exactly the fields typed, refuse an empty name or
 * a zero duration before the wire, and the page must show the new contract
 * value at once.
 */
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'projects' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

async function openEdit(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('button', { name: 'إجراءات' }).click();
  await page.getByRole('menuitem', { name: 'تعديل البيانات' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'تعديل بيانات المشروع' })).toBeVisible();
  return dialog;
}
// Number inputs in the dialog, in order: contract, duration, percent, retention, reserve, VAT.
const numbers = (dialog: ReturnType<Page['getByRole']>) => dialog.locator('input[type="number"]');

test('saving writes the typed figures and the new contract value shows on the page', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openEdit(page);
  const dialog = page.getByRole('dialog');
  await expect(numbers(dialog).nth(0)).toHaveValue('1000000');
  await expect(numbers(dialog).nth(1)).toHaveValue('12');
  await numbers(dialog).nth(0).fill('1200000');
  await numbers(dialog).nth(1).fill('18');
  await numbers(dialog).nth(3).fill('5');
  await dialog.getByRole('textbox').first().fill('  مشروع الاختبار المعدّل  ');
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();

  await expect(page.getByText('تم تحديث بيانات المشروع')).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(patches(wire)).toHaveLength(1);
  const patch = patches(wire)[0];
  expect(patch).toMatchObject({ name: 'مشروع الاختبار المعدّل', duration_months: 18 });
  expect(Number(patch.contract_value)).toBe(1200000);
  expect(Number(patch.retention_percent)).toBe(5);
  expect(patch).not.toHaveProperty('status');
  expect(patch).not.toHaveProperty('company_id');
  await expect(page.getByText('مشروع الاختبار المعدّل').first()).toBeVisible();

  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'المصروفات', exact: true }).click();
  await expect(page.getByText(/12,000\.00 ر\.س \/ 1,200,000\.00/)).toBeVisible();
});

test('an empty name or a zero duration is refused before the wire', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openEdit(page);
  await dialog.getByRole('textbox').first().fill('   ');
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('اسم المشروع مطلوب')).toBeVisible();

  await dialog.getByRole('textbox').first().fill('مشروع الاختبار');
  await numbers(dialog).nth(1).fill('0');
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('المدة يجب أن تكون شهر واحد على الأقل')).toBeVisible();
  expect(patches(wire)).toHaveLength(0);
  await expect(dialog).toBeVisible();
});
