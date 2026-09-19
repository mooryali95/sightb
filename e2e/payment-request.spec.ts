import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * Raising a payment request. A request is the instruction that moves money
 * to a person, so what must hold is that the amount typed is the amount on
 * the wire, that the request is created as a draft and then submitted (two
 * writes, never one that skips the draft), and that a request for nothing,
 * or for nobody, never leaves the browser.
 */
const RESOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const resource = { id: RESOURCE_ID, project_id: PROJECT_ID, name: 'سارة المهندسة', role: 'مهندسة', monthly_cost: 9000, user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' };

async function openNewRequest(page: import('@playwright/test').Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المالية' }).click();
  await page.getByRole('button', { name: 'مستحقات الموارد', exact: true }).click();
  await page.getByRole('tab', { name: /طلبات الصرف/ }).click();
  await page.getByRole('button', { name: /طلب صرف جديد/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').filter({ hasText: 'اختر المورد' }).click();
  await page.getByRole('option', { name: 'سارة المهندسة' }).click();
  await dialog.getByRole('combobox').filter({ hasText: 'استرداد مصاريف' }).click();
  await page.getByRole('option', { name: 'سلفة', exact: true }).click();
  return dialog;
}

test('creates an advance as a draft and submits it with the amount as typed', async ({ page }) => {
  const wire = await stubSupabase(page, { resources: [resource] });
  const dialog = await openNewRequest(page);
  await dialog.locator('input[type="number"]').fill('2500');
  await dialog.getByPlaceholder('استرداد مصاريف لابتوب').fill('سلفة سفر');
  await dialog.getByRole('button', { name: /إنشاء|إرسال/ }).click();

  await expect(page.getByText('تم إنشاء وإرسال طلب الصرف')).toBeVisible();
  const writes = wire.writes.filter((w) => w.table === 'payment_requests');
  expect(writes.map((w) => w.method)).toEqual(['POST', 'PATCH']);
  const created = (Array.isArray(writes[0].body) ? writes[0].body[0] : writes[0].body) as Record<string, unknown>;
  expect(created).toMatchObject({ project_id: PROJECT_ID, resource_id: RESOURCE_ID, request_type: 'advance', status: 'draft', description: 'سلفة سفر' });
  expect(Number(created.amount)).toBe(2500);
  const submitted = writes[1].body as Record<string, unknown>;
  expect(submitted.status).toBe('submitted');
  expect(typeof submitted.requested_at).toBe('string');
});

test('refuses a request for nothing', async ({ page }) => {
  const wire = await stubSupabase(page, { resources: [resource] });
  const dialog = await openNewRequest(page);
  await dialog.getByPlaceholder('استرداد مصاريف لابتوب').fill('سلفة بلا مبلغ');
  await dialog.getByRole('button', { name: /إنشاء|إرسال/ }).click();

  await expect(page.getByText('المبلغ يجب أن يكون أكبر من صفر')).toBeVisible();
  expect(wire.writes.filter((w) => w.table === 'payment_requests')).toHaveLength(0);
});
