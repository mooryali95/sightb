import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';

/**
 * The gap this closes: after the password, the page asked for the emailed
 * code, but the session already existed, so typing the home address during
 * the code step landed in the app. Now a session that owes its code is sent
 * back to the code step from any protected page, finishes it there without
 * the password, and only then reaches the app.
 */
test('a session that owes its code is sent from the home page to the code step, and gets in only with the code', async ({ page }) => {
  let passed = false;
  const wire = await stubSupabase(page, {}, {
    'second-factor': (body) => {
      const { action, code } = body as { action: string; code?: string };
      if (action === 'status') return { required: true, verified: passed };
      if (action === 'check') return passed ? { requiresOtp: false } : { requiresOtp: true, sent: true };
      if (action === 'verify') {
        passed = code === '482913';
        return passed ? { verified: true } : { verified: false, error: 'الرمز غير صحيح أو انتهت صلاحيته' };
      }
      return {};
    },
  });

  // The session is there (seeded); the address bar skips the login page.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?step=code$/);
  await expect(page.getByText('التحقق بخطوتين')).toBeVisible();
  expect(wire.writes.some((w) => w.table === 'second-factor' && (w.body as { action: string }).action === 'check')).toBe(true);

  await page.getByRole('textbox').first().fill('111111');
  await page.getByRole('button', { name: 'تأكيد الرمز' }).click();
  await expect(page.getByText('الرمز غير صحيح أو انتهت صلاحيته').first()).toBeVisible();
  await expect(page).toHaveURL(/\/login\?step=code$/);

  await page.getByRole('textbox').first().fill('482913');
  await page.getByRole('button', { name: 'تأكيد الرمز' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('التحقق بخطوتين')).toHaveCount(0);
  const verifies = wire.writes.filter((w) => w.table === 'second-factor' && (w.body as { action: string }).action === 'verify');
  expect(verifies.map((w) => (w.body as { code: string }).code)).toEqual(['111111', '482913']);
});

test('a session that has passed goes straight to its page', async ({ page }) => {
  await stubSupabase(page, {}, { 'second-factor': () => ({ required: true, verified: true }) });
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('التحقق بخطوتين')).toHaveCount(0);
});

test('while second-factor is not deployed, sign-in falls back to admin-otp instead of failing', async ({ page }) => {
  const wire = await stubSupabase(page, {}, {
    'admin-otp': (body) => ((body as { action: string }).action === 'check' ? { requiresOtp: true, sent: true } : {}),
  });
  // What a browser gets from a function that does not exist: the CORS
  // preflight fails, and the request never arrives.
  await page.route('**/functions/v1/second-factor', (route) => route.abort('failed'));

  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill('pm@example.com');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('secret1');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

  await expect(page.getByText('التحقق بخطوتين')).toBeVisible();
  expect(wire.writes.filter((w) => w.table === 'admin-otp').map((w) => (w.body as { action: string }).action)).toEqual(['check']);
});
