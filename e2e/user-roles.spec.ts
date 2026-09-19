import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, USER_ID } from './support/seed';

/**
 * The gates on the users page. Nobody deletes their own account or strips
 * their own admin role; an owner role is never strippable from here; an
 * owner's account is deletable by an owner only. Past the gates, removing
 * a role deletes that row and deleting an account calls the edge function
 * with the account's id.
 */
const OWNER_ID = '44444444-4444-4444-8444-444444444402';
const SAMI_ID = '44444444-4444-4444-8444-444444444403';
const profiles = [
  { id: OWNER_ID, email: 'owner@example.com', full_name: 'المالك', status: 'active' },
  { id: SAMI_ID, email: 'sami@example.com', full_name: 'سامي', status: 'active' },
];
const roles = [
  { id: 'r-owner', user_id: OWNER_ID, role: 'owner', scope_type: 'system', scope_id: null },
  { id: 'r-sami', user_id: SAMI_ID, role: 'editor', scope_type: 'company', scope_id: COMPANY_ID },
];
const selfOwner = { id: 'r-self-owner', user_id: USER_ID, role: 'owner', scope_type: 'system', scope_id: null };

async function openUsers(page: Page) {
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'إدارة المستخدمين' })).toBeVisible();
  await expect(page.getByText('sami@example.com')).toBeVisible();
}
const cardOf = (page: Page, email: string) => page.locator('div.rounded-lg.border', { hasText: email }).first();
const chipOf = (card: ReturnType<typeof cardOf>, label: string) => card.locator('div.rounded-md', { hasText: label });
const deleteButton = (card: ReturnType<typeof cardOf>) => card.getByRole('button', { name: 'حذف الحساب' });
const writes = (wire: { writes: { method: string; table: string; body: unknown }[] }, method: string, table: string) =>
  wire.writes.filter((w) => w.method === method && w.table === table);

test('an admin cannot touch themselves or an owner, and past the gates a role row is deleted and an account handed to the function', async ({ page }) => {
  const wire = await stubSupabase(page, { profiles, user_roles: roles });
  await openUsers(page);

  const self = cardOf(page, 'e2e@example.com');
  await expect(deleteButton(self)).toHaveCount(0);
  await expect(chipOf(self, 'أدمن').getByRole('button')).toHaveCount(0);

  const owner = cardOf(page, 'owner@example.com');
  await expect(deleteButton(owner)).toHaveCount(0);
  await expect(chipOf(owner, 'مالك').getByRole('button')).toHaveCount(0);

  const sami = cardOf(page, 'sami@example.com');
  await expect(chipOf(sami, 'محرر')).toContainText('شركة الاختبار');
  await chipOf(sami, 'محرر').getByRole('button').click();
  await expect(page.getByRole('alertdialog').getByRole('heading', { name: 'إزالة الصلاحية' })).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف' }).click();
  await expect.poll(() => writes(wire, 'DELETE', 'user_roles').length).toBe(1);

  await deleteButton(sami).click();
  await expect(page.getByRole('alertdialog').getByRole('heading', { name: 'حذف الحساب نهائياً' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toContainText('هل تريد حذف حساب sami@example.com بالكامل؟');
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByText('تم حذف الحساب بنجاح').first()).toBeVisible();
  const calls = writes(wire, 'INVOKE', 'delete-user');
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toStrictEqual({ targetUserId: SAMI_ID });
});

test('an owner may delete another owner, whose owner role still cannot be stripped', async ({ page }) => {
  await stubSupabase(page, { profiles, user_roles: [...roles, selfOwner] });
  await openUsers(page);
  const owner = cardOf(page, 'owner@example.com');
  await expect(deleteButton(owner)).toBeVisible();
  await expect(chipOf(owner, 'مالك').getByRole('button')).toHaveCount(0);
  const self = cardOf(page, 'e2e@example.com');
  await expect(deleteButton(self)).toHaveCount(0);
  await expect(chipOf(self, 'مالك').getByRole('button')).toHaveCount(0);
});
