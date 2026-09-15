import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * Approving a change order. The contract is the denominator of every margin
 * on the project, so what matters is that an approved order moves it by
 * exactly its impact, and that the budget items it carries land in the plan
 * once, labelled as coming from the order. A proposed order must do neither:
 * counting it early overstates the contract before anyone has signed.
 */
async function openChangeOrders(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'الإدارة' }).click();
  // Change orders are the management group's default section, so the accordion
  // already holds it open; clicking its header again would close it and unmount
  // the very button the spec is about to press.
  const header = page.getByRole('button', { name: 'أوامر التغيير' });
  await expect(header).toBeVisible();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByText(/الأصلية: 1,000,000\.00/)).toBeVisible();
}

test('an approved order moves the contract and adds its items to the plan', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openChangeOrders(page);

  await page.getByRole('button', { name: /أمر تغيير$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('وصف التغيير المطلوب').fill('توسعة النطاق');
  await dialog.getByPlaceholder('50000').fill('20000');
  await dialog.getByPlaceholder('وصف البند').fill('مهندس إضافي');
  await dialog.getByPlaceholder('المبلغ').fill('12000');
  await dialog.getByRole('button', { name: '+ بند' }).click();
  await expect(dialog.getByText(/إجمالي البنود: 12,000\.00/)).toBeVisible();

  await dialog.getByRole('combobox').filter({ hasText: 'مقترح' }).click();
  await page.getByRole('option', { name: 'معتمد', exact: true }).click();
  await dialog.getByRole('button', { name: 'إضافة أمر التغيير' }).click();

  // 1,000,000 + 20,000: the line the margins read from.
  await expect(page.getByText(/المعدّلة: 1,020,000\.00/)).toBeVisible();

  const order = wire.writes.find((w) => w.table === 'change_orders' && w.method === 'POST');
  expect(order, 'a change order should have been posted').toBeTruthy();
  const row = (Array.isArray(order!.body) ? order!.body[0] : order!.body) as Record<string, unknown>;
  expect(Number(row.amount_impact)).toBe(20000);
  expect(row.status).toBe('approved');
  expect(JSON.parse(String(row.budget_items_json))).toEqual([
    expect.objectContaining({ description: 'مهندس إضافي', plannedAmount: 12000 }),
  ]);

  // The item is written after the order resolves, so the contract line can be
  // on screen before the plan write has left the browser: wait for it.
  const itemWrites = () => wire.writes.filter((w) => w.table === 'budget_items' && w.method === 'POST');
  await expect.poll(() => itemWrites().length, { message: 'the order\'s item should reach the plan' }).toBe(1);
  const items = itemWrites();
  const item = (Array.isArray(items[0].body) ? items[0].body[0] : items[0].body) as Record<string, unknown>;
  expect(item.description).toBe('[أمر تغيير] مهندس إضافي');
  expect(Number(item.planned_amount)).toBe(12000);
});

test('a proposed order leaves the contract and the plan alone', async ({ page }) => {
  const wire = await stubSupabase(page);
  await openChangeOrders(page);

  await page.getByRole('button', { name: /أمر تغيير$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('وصف التغيير المطلوب').fill('تعديل مقترح');
  await dialog.getByPlaceholder('50000').fill('9000');
  await dialog.getByPlaceholder('وصف البند').fill('بند معلّق');
  await dialog.getByPlaceholder('المبلغ').fill('500');
  await dialog.getByRole('button', { name: '+ بند' }).click();
  await dialog.getByRole('button', { name: 'إضافة أمر التغيير' }).click();

  await expect(page.getByText('تعديل مقترح')).toBeVisible();
  await expect(page.getByText(/المعدّلة: 1,000,000\.00/)).toBeVisible();
  expect(wire.writes.filter((w) => w.table === 'change_orders')).toHaveLength(1);
  expect(wire.writes.filter((w) => w.table === 'budget_items')).toHaveLength(0);
});
