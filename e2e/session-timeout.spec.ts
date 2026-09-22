import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';

/**
 * The idle timeout, on a faked clock. Twenty-eight minutes of stillness
 * raise the warning with the seconds left; pressing to continue clears
 * it and starts the count again; thirty minutes of stillness sign the
 * person out to the login page. Any activity resets the count, so the
 * clock is driven with no pointer or key touching the page.
 */
const MINUTE = 60_000;

test('twenty-eight idle minutes warn, continuing clears the warning, thirty sign out to the login page', async ({ page }) => {
  await page.clock.install();
  await stubSupabase(page);
  const signOuts: string[] = [];
  await page.route('**/auth/v1/logout**', (route) => {
    signOuts.push(route.request().url());
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  const warning = page.getByRole('alertdialog');

  await page.clock.fastForward(27 * MINUTE + 30_000);
  await expect(warning).toHaveCount(0);

  await page.clock.fastForward(MINUTE);
  await expect(warning.getByRole('heading', { name: 'تحذير: انتهاء الجلسة' })).toBeVisible();
  await expect(warning).toContainText('سيتم تسجيل خروجك تلقائياً بسبب عدم النشاط خلال');
  await expect(warning).toContainText(/1 دقيقة و (29|30) ثانية/);
  expect(signOuts).toHaveLength(0);

  await warning.getByRole('button', { name: 'متابعة العمل' }).click();
  await expect(warning).toHaveCount(0);
  await page.clock.fastForward(27 * MINUTE);
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();

  await page.clock.fastForward(MINUTE);
  await expect(warning.getByRole('heading', { name: 'تحذير: انتهاء الجلسة' })).toBeVisible();
  await page.clock.fastForward(2 * MINUTE);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  expect(signOuts).toHaveLength(1);
});
