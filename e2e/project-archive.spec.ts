import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, seed } from './support/seed';

/**
 * Taking a project out of service. Archiving is the reversible step: it only
 * flips the status, keeps every row, and sends the user back to the
 * dashboard. Permanent deletion is offered only on an archived project, and
 * when it runs it has to clear the project's children before the project
 * row itself, or the database would be left with orphans pointing nowhere.
 */
const ARCHIVED_ID = '55555555-5555-4555-8555-555555555555';
const archivedProject = { ...seed.projects[0], id: ARCHIVED_ID, name: 'مشروع مؤرشف', status: 'archived' };
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, method: string) =>
  wire.writes.filter((w) => w.method === method);

async function openActions(page: import('@playwright/test').Page, id: string, name: string) {
  await page.goto(`/project/${id}`);
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole('button', { name: 'إجراءات' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('archiving asks first, writes only the status, and returns to the dashboard', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openActions(page, PROJECT_ID, 'مشروع الاختبار');
  await expect(page.getByRole('menuitem', { name: 'حذف نهائي' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'أرشفة المشروع' }).click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'أرشفة المشروع' })).toBeVisible();
  await expect(confirm).toContainText('سيتم نقل مشروع "مشروع الاختبار" إلى الأرشيف');
  await confirm.getByRole('button', { name: 'أرشفة' }).click();

  await expect(page.getByText('تم أرشفة المشروع')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const patches = writes(wire, 'PATCH');
  expect(patches).toHaveLength(1);
  expect(patches[0].table).toBe('projects');
  expect(patches[0].body).toStrictEqual({ status: 'archived' });
  expect(writes(wire, 'DELETE')).toHaveLength(0);
});

test('an archived project can be deleted for good, children first and the project last', async ({ page }) => {
  const wire = await stubSupabase(page, { projects: [archivedProject] });
  await openActions(page, ARCHIVED_ID, 'مشروع مؤرشف');
  await expect(page.getByRole('menuitem', { name: 'أرشفة المشروع' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'حذف نهائي' }).click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'حذف نهائي للمشروع' })).toBeVisible();
  await expect(confirm).toContainText('لا يمكن التراجع');
  await confirm.getByRole('button', { name: 'حذف نهائي' }).click();

  await expect(page.getByText('تم حذف المشروع نهائياً')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const deleted = writes(wire, 'DELETE').map((w) => w.table);
  expect(deleted.at(-1)).toBe('projects');
  expect(deleted.filter((t) => t === 'projects')).toHaveLength(1);
  for (const child of ['risks', 'change_orders', 'milestones', 'revenues', 'expenses', 'budget_items', 'resources', 'custodies', 'commitments', 'cost_baselines']) {
    expect(deleted.indexOf(child)).toBeGreaterThanOrEqual(0);
    expect(deleted.indexOf(child)).toBeLessThan(deleted.length - 1);
  }
  expect(writes(wire, 'PATCH')).toHaveLength(0);
});
