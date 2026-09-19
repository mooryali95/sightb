import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Amending a budget the baseline has locked. Opening takes a snapshot of
 * the plan as it stands, with its total, and a written reason; approving
 * takes the "after" snapshot and total; cancelling closes the draft with
 * nothing else. Without those snapshots there is no way to compare what
 * the plan was against what someone changed it to.
 */
const baseline = {
  cost_baselines: [{ id: 'bl-1', project_id: PROJECT_ID, user_id: USER_ID, name: 'الخطة المعتمدة', version: 1, is_active: true, total_planned: 400000, created_at: '2026-02-01T00:00:00Z' }],
};
const snapshotItem = { id: '66666666-6666-4666-8666-666666666666', category: 'materials', description: 'بند المواد', plannedAmount: 400000 };
const draft = {
  budget_amendments: [{
    id: 'am-1', project_id: PROJECT_ID, user_id: USER_ID, reason: 'إعادة توزيع بند المواد', snapshot_before: [snapshotItem],
    snapshot_after: null, total_before: 400000, total_after: null, status: 'draft', approved_by: null, approved_at: null,
    created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  }],
};
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, method: string) =>
  wire.writes.filter((w) => w.table === 'budget_amendments' && w.method === method).map((w) => w.body as Record<string, unknown>);

async function openBudget(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'الموازنة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تعديل الموازنة المقفلة' })).toBeVisible();
}

test('opening a locked budget needs a reason and snapshots the plan with its total', async ({ page }) => {
  const wire = await stubSupabase(page, baseline);
  await openBudget(page);
  await expect(page.getByText('الموازنة مقفلة بخط الأساس.')).toBeVisible();
  await page.getByRole('button', { name: 'فتح الموازنة للتعديل' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'فتح الموازنة', exact: true })).toBeDisabled();
  await dialog.getByRole('textbox').fill('  تصحيح تقدير المواد  ');
  await dialog.getByRole('button', { name: 'فتح الموازنة', exact: true }).click();

  await expect(page.getByText('تم فتح الموازنة للتعديل — أُخذت لقطة قبل التعديل')).toBeVisible();
  await expect.poll(() => writes(wire, 'POST').length).toBe(1);
  const opened = writes(wire, 'POST')[0];
  expect(opened).toMatchObject({ user_id: USER_ID, project_id: PROJECT_ID, reason: 'تصحيح تقدير المواد', status: 'draft' });
  expect(Number(opened.total_before)).toBe(400000);
  const snapshot = opened.snapshot_before as Record<string, unknown>[];
  expect(snapshot).toHaveLength(1);
  expect(snapshot[0]).toMatchObject(snapshotItem);

  await expect(page.getByText('الموازنة مفتوحة للتعديل الآن')).toBeVisible();
  await expect(page.getByText('تصحيح تقدير المواد')).toBeVisible();
  await expect(page.getByText(/لقطة قبل: 400,000\.00/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'فتح الموازنة للتعديل' })).toHaveCount(0);
});

test('approving a draft writes the after snapshot and total, and closes it', async ({ page }) => {
  const wire = await stubSupabase(page, { ...baseline, ...draft });
  await openBudget(page);
  await expect(page.getByText('إعادة توزيع بند المواد')).toBeVisible();
  await page.getByRole('button', { name: 'اعتماد التعديل' }).click();

  await expect(page.getByText('تم اعتماد التعديل وحفظ لقطة بعد التعديل للمقارنة')).toBeVisible();
  await expect.poll(() => writes(wire, 'PATCH').length).toBe(1);
  const approved = writes(wire, 'PATCH')[0];
  expect(approved).toMatchObject({ status: 'approved' });
  expect(Number(approved.total_after)).toBe(400000);
  expect((approved.snapshot_after as Record<string, unknown>[])[0]).toMatchObject(snapshotItem);
  expect(typeof approved.approved_at).toBe('string');
  await expect(page.getByText('الموازنة مفتوحة للتعديل الآن')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'فتح الموازنة للتعديل' })).toBeVisible();
});

test('cancelling a draft asks first and writes only the cancelled status', async ({ page }) => {
  const wire = await stubSupabase(page, { ...baseline, ...draft });
  await openBudget(page);
  await page.getByRole('button', { name: 'إلغاء التعديل' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'إلغاء تعديل الموازنة؟' })).toBeVisible();
  await confirm.getByRole('button', { name: 'تراجع' }).click();
  await expect(confirm).toBeHidden();
  expect(writes(wire, 'PATCH')).toHaveLength(0);

  await page.getByRole('button', { name: 'إلغاء التعديل' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد الإلغاء' }).click();
  await expect(page.getByText('تم إلغاء التعديل — الموازنة مقفلة كما كانت')).toBeVisible();
  await expect.poll(() => writes(wire, 'PATCH').length).toBe(1);
  expect(writes(wire, 'PATCH')[0]).toStrictEqual({ status: 'cancelled' });
  await expect(page.getByRole('button', { name: 'فتح الموازنة للتعديل' })).toBeVisible();
});
