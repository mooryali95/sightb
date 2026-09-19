import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID } from './support/seed';

/**
 * Inviting someone in. The invite is the only way access is granted, so
 * what leaves the browser must be exactly the address typed (lower-cased),
 * the role, and the scope: a system-wide invite carries no scope id, and a
 * company-scoped one must name the company or it does not go at all.
 */
const invites = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.method === 'INVOKE' && w.table === 'send-invite').map((w) => w.body as Record<string, unknown>);

async function openInvite(page: import('@playwright/test').Page) {
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'إدارة المستخدمين' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'دعوة مستخدم جديد' })).toBeVisible();
  return page.locator('form').filter({ has: page.getByPlaceholder('user@example.com') });
}

test('a system-wide editor invite goes out with the address lower-cased and no scope id', async ({ page }) => {
  const wire = await stubSupabase(page);
  const form = await openInvite(page);
  await form.getByPlaceholder('user@example.com').fill('New.Editor@Example.com');
  await form.getByRole('combobox').filter({ hasText: 'مشاهد' }).click();
  await page.getByRole('option', { name: 'محرر' }).click();
  await expect(form.getByText('تعديل: إضافة/تعديل/حذف البيانات ضمن النطاق المحدد')).toBeVisible();
  await form.getByRole('button', { name: 'إرسال الدعوة' }).click();

  await expect(page.getByText('تم حفظ الدعوة. يمكن للمستخدم التسجيل مباشرة.')).toBeVisible();
  expect(invites(wire)).toHaveLength(1);
  expect(invites(wire)[0]).toStrictEqual({ email: 'new.editor@example.com', role: 'editor', scope_type: 'system', scope_id: null });
  // The form is cleared for the next invite.
  await expect(form.getByPlaceholder('user@example.com')).toHaveValue('');
  await expect(form.getByRole('combobox').filter({ hasText: 'مشاهد' })).toBeVisible();
});

test('a company-scoped invite must name the company, and then carries its id', async ({ page }) => {
  const wire = await stubSupabase(page);
  const form = await openInvite(page);
  await form.getByPlaceholder('user@example.com').fill('viewer@example.com');
  await form.getByRole('combobox').filter({ hasText: 'النظام بالكامل' }).click();
  await page.getByRole('option', { name: 'شركة محددة' }).click();
  await form.getByRole('button', { name: 'إرسال الدعوة' }).click();
  await expect(page.getByText('يرجى اختيار النطاق')).toBeVisible();
  expect(invites(wire)).toHaveLength(0);

  await form.getByRole('combobox').filter({ hasText: 'اختر شركة' }).click();
  await page.getByRole('option', { name: 'شركة الاختبار' }).click();
  await form.getByRole('button', { name: 'إرسال الدعوة' }).click();
  await expect(page.getByText('تم حفظ الدعوة. يمكن للمستخدم التسجيل مباشرة.')).toBeVisible();
  expect(invites(wire)).toHaveLength(1);
  expect(invites(wire)[0]).toStrictEqual({ email: 'viewer@example.com', role: 'viewer', scope_type: 'company', scope_id: COMPANY_ID });
});
