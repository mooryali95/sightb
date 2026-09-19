import { test, expect, type Page, type Locator } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID } from './support/seed';

/**
 * Editing a company from its page. A blank name is refused before any
 * write; a padded name is written trimmed with the description beside it,
 * and the header shows both; emptying the description clears it on the
 * wire (`null`, never the empty string) and takes the line off the header.
 */
const patches = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.table === 'companies' && w.method === 'PATCH').map((w) => w.body as Record<string, unknown>);

async function openEdit(page: Page) {
  await page.goto(`/company/${COMPANY_ID}`);
  await expect(page.getByRole('heading', { name: 'شركة الاختبار' })).toBeVisible();
  await page.getByRole('button', { name: 'تعديل', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'تعديل بيانات الشركة' })).toBeVisible();
  return dialog;
}
// The labels are not wired to the fields, so the two textboxes are taken in order: name, then description.
const nameOf = (dialog: Locator) => dialog.getByRole('textbox').nth(0);
const descriptionOf = (dialog: Locator) => dialog.getByRole('textbox').nth(1);

test('a blank name is refused, and a padded name is written trimmed with its description', async ({ page }) => {
  const wire = await stubSupabase(page);
  const dialog = await openEdit(page);

  await nameOf(dialog).fill('   ');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('اسم الشركة مطلوب')).toBeVisible();
  expect(patches(wire)).toHaveLength(0);

  await nameOf(dialog).fill('  شركة الأفق  ');
  await descriptionOf(dialog).fill('مقاولات عامة');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('تم تحديث بيانات الشركة')).toBeVisible();
  await expect.poll(() => patches(wire).length).toBe(1);
  expect(patches(wire)[0]).toStrictEqual({ name: 'شركة الأفق', description: 'مقاولات عامة' });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'شركة الأفق' })).toBeVisible();
  await expect(page.getByText('مقاولات عامة')).toBeVisible();
});

test('emptying the description clears it on the wire and takes it off the header', async ({ page }) => {
  const wire = await stubSupabase(page);
  let dialog = await openEdit(page);
  await descriptionOf(dialog).fill('وصف قديم');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('وصف قديم')).toBeVisible();

  dialog = await openEdit(page);
  await expect(descriptionOf(dialog)).toHaveValue('وصف قديم');
  await descriptionOf(dialog).fill('');
  await dialog.getByRole('button', { name: 'حفظ' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => patches(wire).length).toBe(2);
  expect(patches(wire)[1]).toStrictEqual({ name: 'شركة الاختبار', description: null });
  await expect(page.getByText('وصف قديم')).toHaveCount(0);
});
