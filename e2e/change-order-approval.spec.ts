import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Approving a change order that was proposed earlier. The approval must
 * stamp who and when, move the effective contract by the order's impact,
 * and add the order's items to the plan exactly once: an edit that keeps
 * the order approved must not add them again.
 */
const CO_ID = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
const order = (over: Record<string, unknown> = {}) => ({
  id: CO_ID, project_id: PROJECT_ID, user_id: USER_ID, description: 'توسعة النطاق', change_type: 'scope_addition',
  amount_impact: 20000, duration_impact: 0, status: 'proposed', requested_by: 'العميل', approved_by: null, approved_date: null,
  budget_items_json: JSON.stringify([{ category: 'consulting', description: 'مهندس إضافي', plannedAmount: 12000, costType: 'fixed' }]),
  auto_rebaseline: false, created_at: '2026-02-01T00:00:00Z', ...over,
});
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, table: string, method: string) =>
  wire.writes.filter((w) => w.table === table && w.method === method).map((w) => (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>);

async function openOrders(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'الإدارة' }).click();
  const header = page.getByRole('button', { name: 'أوامر التغيير' });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText(/الأصلية: 1,000,000\.00/)).toBeVisible();
}
async function editOrder(page: Page) {
  await page.getByRole('row').filter({ hasText: 'توسعة النطاق' }).getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'حفظ التعديلات' })).toBeVisible();
  return dialog;
}

test('approving a proposed order stamps it, moves the contract, and adds its items to the plan once', async ({ page }) => {
  const wire = await stubSupabase(page, { change_orders: [order()] });
  await openOrders(page);
  await expect(page.getByText(/المعدّلة: 1,000,000\.00/)).toBeVisible();
  let dialog = await editOrder(page);
  await dialog.getByRole('combobox').filter({ hasText: 'مقترح' }).click();
  await page.getByRole('option', { name: 'معتمد', exact: true }).click();
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('تم تعديل أمر التغيير')).toBeVisible();

  await expect.poll(() => writes(wire, 'budget_items', 'POST').length).toBe(1);
  const patch = writes(wire, 'change_orders', 'PATCH');
  expect(patch).toHaveLength(1);
  expect(patch[0]).toMatchObject({ status: 'approved', approved_by: 'admin' });
  expect(String(patch[0].approved_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Number(patch[0].amount_impact)).toBe(20000);
  const item = writes(wire, 'budget_items', 'POST')[0];
  expect(item).toMatchObject({ project_id: PROJECT_ID, category: 'consulting', description: '[أمر تغيير] مهندس إضافي', cost_type: 'fixed' });
  expect(Number(item.planned_amount)).toBe(12000);
  // The plan grew by 12,000, and the approval froze it: 400,000 + 12,000 in baseline v1.
  await expect.poll(() => writes(wire, 'cost_baselines', 'POST').length).toBe(1);
  const baseline = writes(wire, 'cost_baselines', 'POST')[0];
  expect(baseline).toMatchObject({ project_id: PROJECT_ID, version: 1, is_active: true, name: 'v1 — توسعة النطاق' });
  expect(Number(baseline.total_planned)).toBe(412000);
  await expect(page.getByText(/المعدّلة: 1,020,000\.00/)).toBeVisible();

  // An edit that keeps the order approved adds nothing to the plan and no baseline.
  dialog = await editOrder(page);
  await dialog.getByRole('textbox').first().fill('توسعة النطاق المعتمدة');
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect.poll(() => writes(wire, 'change_orders', 'PATCH').length).toBe(2);
  expect(writes(wire, 'change_orders', 'PATCH')[1]).toMatchObject({ status: 'approved', description: 'توسعة النطاق المعتمدة' });
  expect(writes(wire, 'budget_items', 'POST')).toHaveLength(1);
  expect(writes(wire, 'cost_baselines', 'POST')).toHaveLength(1);
  await expect(page.getByText(/المعدّلة: 1,020,000\.00/)).toBeVisible();
});

test('rejecting a proposed order leaves the contract and the plan alone', async ({ page }) => {
  const wire = await stubSupabase(page, { change_orders: [order()] });
  await openOrders(page);
  const dialog = await editOrder(page);
  await dialog.getByRole('combobox').filter({ hasText: 'مقترح' }).click();
  await page.getByRole('option', { name: 'مرفوض', exact: true }).click();
  await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByText('تم تعديل أمر التغيير')).toBeVisible();
  await expect.poll(() => writes(wire, 'change_orders', 'PATCH').length).toBe(1);
  expect(writes(wire, 'change_orders', 'PATCH')[0]).toMatchObject({ status: 'rejected' });
  expect(writes(wire, 'change_orders', 'PATCH')[0].approved_by).toBeUndefined();
  expect(writes(wire, 'budget_items', 'POST')).toHaveLength(0);
  expect(writes(wire, 'cost_baselines', 'POST')).toHaveLength(0);
  await expect(page.getByText(/المعدّلة: 1,000,000\.00/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'توسعة النطاق' })).toContainText('مرفوض');
});
