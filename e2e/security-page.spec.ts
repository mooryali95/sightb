import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';

/**
 * The security page around its list. It lists the account's passkeys
 * with their kind and dates, deletes one after confirmation through the
 * function by id and drops it from the list, refuses to register under a
 * blank name before asking the function, and says so on a browser with
 * no passkey support, with the add button disabled.
 */
const invokes = (wire: { writes: { method: string; table: string; body: unknown }[] }, action: string) =>
  wire.writes.filter((w) => w.method === 'INVOKE' && w.table === 'passkeys' && (w.body as { action?: string })?.action === action).map((w) => w.body as Record<string, unknown>);
const synced = { id: 'pk-1', name: 'هاتفي', createdAt: '2026-08-01T00:00:00Z', lastUsedAt: '2026-09-19T00:00:00Z', deviceType: 'multiDevice', backedUp: true, transports: ['internal', 'hybrid'] };
const local = { id: 'pk-2', name: 'مفتاح المكتب', createdAt: '2026-09-01T00:00:00Z', lastUsedAt: null, deviceType: 'singleDevice', backedUp: false, transports: ['usb'] };

async function openSecurity(page: Page) {
  await page.goto('/security');
  await expect(page.getByRole('heading', { name: 'الأمان' })).toBeVisible();
}
const row = (page: Page, name: string) => page.getByText(name, { exact: true }).locator('..').locator('..');

test('lists the passkeys with their kind and dates, and deletes one by id after confirmation', async ({ page }) => {
  let list = [synced, local];
  const wire = await stubSupabase(page, {}, {
    passkeys: (body) => {
      const { action, id } = body as { action: string; id?: string };
      if (action === 'list') return { passkeys: list };
      if (action === 'delete') { list = list.filter((p) => p.id !== id); return { deleted: true }; }
      return {};
    },
  });
  await openSecurity(page);
  await expect(row(page, 'هاتفي')).toContainText('مفتاح مزامَن عبر أجهزتك');
  await expect(row(page, 'هاتفي')).not.toContainText('لم يُستخدم بعد');
  await expect(row(page, 'مفتاح المكتب')).toContainText('مفتاح على هذا الجهاز فقط');
  await expect(row(page, 'مفتاح المكتب')).toContainText('آخر استخدام: لم يُستخدم بعد');

  await row(page, 'مفتاح المكتب').locator('..').getByRole('button').last().click();
  await expect(page.getByRole('alertdialog').getByRole('heading', { name: 'حذف مفتاح المرور' })).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء' }).click();
  expect(invokes(wire, 'delete')).toHaveLength(0);

  await row(page, 'مفتاح المكتب').locator('..').getByRole('button').last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByText('تم حذف مفتاح المرور').first()).toBeVisible();
  expect(invokes(wire, 'delete')).toEqual([{ action: 'delete', id: 'pk-2' }]);
  await expect(page.getByText('مفتاح المكتب', { exact: true })).toHaveCount(0);
  await expect(page.getByText('هاتفي', { exact: true })).toBeVisible();
});

test('refuses a blank name before asking the function, and shows the empty state', async ({ page }) => {
  const wire = await stubSupabase(page, {}, { passkeys: (body) => ((body as { action: string }).action === 'list' ? { passkeys: [] } : {}) });
  await openSecurity(page);
  await expect(page.getByText('لا توجد مفاتيح مرور مسجّلة. أضف واحداً لتدخل ببصمتك دون كلمة مرور.')).toBeVisible();
  await page.getByRole('button', { name: 'إضافة مفتاح مرور' }).click();
  await page.getByLabel('اسم المفتاح').fill('   ');
  await page.getByRole('button', { name: 'تسجيل المفتاح' }).click();
  await expect(page.getByText('اكتب اسماً يميّز هذا المفتاح').first()).toBeVisible();
  expect(invokes(wire, 'register-options')).toHaveLength(0);
});

test('a browser without passkey support is told so, with the add button disabled', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true }); });
  await stubSupabase(page, {}, { passkeys: (body) => ((body as { action: string }).action === 'list' ? { passkeys: [synced] } : {}) });
  await openSecurity(page);
  await expect(page.getByText('هذا المتصفح لا يدعم مفاتيح المرور. جرّب متصفحاً أحدث أو جهازاً آخر.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'إضافة مفتاح مرور' })).toBeDisabled();
});
