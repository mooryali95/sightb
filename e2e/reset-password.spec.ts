import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { USER_ID } from './support/seed';

/**
 * The password reset page. Opened from a recovery link carrying tokens
 * in its hash, it sets the session, cleans the address and shows the
 * form; a password under six characters is refused before any call; a
 * good one is sent to the auth service and lands on the dashboard; a
 * "same password" answer is read in words; a link carrying an error
 * says so and returns to the login page.
 */
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = () => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.sig`;
const recoveryLink = () => `/reset-password#access_token=${token()}&refresh_token=e2e-refresh&type=recovery`;

/** Answers the password update and records what was sent. */
async function captureUpdate(page: Page, answer: { status: number; body: unknown }) {
  const sent: unknown[] = [];
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) });
  });
  return sent;
}

test('a recovery link opens the form, refuses a short password, and sends a good one before landing home', async ({ page }) => {
  await stubSupabase(page);
  const sent = await captureUpdate(page, { status: 200, body: { id: USER_ID, email: 'e2e@example.com' } });
  await page.goto(recoveryLink());
  const field = page.getByPlaceholder('••••••••');
  await expect(field).toBeVisible();
  // The tokens are taken off the address once the session is set.
  await expect(page).toHaveURL(/\/reset-password$/);

  // Under six characters the field itself refuses to submit: the browser's own check, before the form's.
  await field.fill('12345');
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  expect(await field.evaluate((el) => (el as HTMLInputElement).validity.tooShort)).toBe(true);
  await page.waitForTimeout(300);
  expect(sent).toHaveLength(0);

  await field.fill('secret-1');
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(page.getByText('تم تغيير كلمة المرور بنجاح').first()).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ password: 'secret-1' });
  await expect(page).toHaveURL(/\/$/);
});

test('a password the service calls the same is read in words', async ({ page }) => {
  await stubSupabase(page);
  const sent = await captureUpdate(page, { status: 422, body: { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' } });
  await page.goto(recoveryLink());
  const field = page.getByPlaceholder('••••••••');
  await expect(field).toBeVisible();
  await field.fill('secret-1');
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(page.getByText('اختر كلمة مرور جديدة مختلفة عن الحالية.').first()).toBeVisible();
  expect(sent).toHaveLength(1);
  await expect(page).toHaveURL(/\/reset-password/);
});

test('a link carrying an error says so and returns to the login page', async ({ page }) => {
  await stubSupabase(page);
  await page.goto('/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByText('الرابط منتهي الصلاحية أو غير صالح. يرجى طلب رابط جديد.').first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
});
