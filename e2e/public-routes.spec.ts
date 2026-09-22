import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';

/**
 * The doors of the app. Signed out, a protected page sends to the welcome
 * page, which offers the login page, and a route that is nothing is told
 * so with a way home. Signed in, the welcome page sends home; a person
 * holding no role at all is refused with a way out, and signing out from
 * there lands on the welcome page. The theme toggle flips the document's
 * class and the choice survives a reload.
 */
async function signedOut(page: Page) {
  const wire = await stubSupabase(page);
  await page.addInitScript(() => window.localStorage.removeItem('sb-e2e-auth-token'));
  return wire;
}

test('signed out, a protected page sends to the welcome page, which offers the login page, and a missing route is told so', async ({ page }) => {
  await signedOut(page);
  await page.goto('/security');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'رؤية' })).toBeVisible();
  await expect(page.getByText('نظام إدارة المحافظ والمشاريع المالية')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'المزايا الرئيسية' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إدارة المحافظ والمشاريع' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'أمان وصلاحيات متقدمة' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'زيارة موقع بصيرة' })).toHaveAttribute('href', 'https://basserh.com');
  await expect(page.getByText(`© ${new Date().getFullYear()} بصيرة`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toHaveCount(0);

  await page.getByRole('button', { name: 'تسجيل الدخول' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();

  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await expect(page.getByText('Oops! Page not found')).toBeVisible();
  await page.getByRole('link', { name: 'Return to Home' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('signed in, the welcome page sends home, a person with no role is refused and signs out to the welcome page', async ({ page }) => {
  await stubSupabase(page);
  await page.goto('/welcome');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();

  await page.route('**/rest/v1/user_roles**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'غير مصرح بالدخول' })).toBeVisible();
  await expect(page.getByText('ليس لديك صلاحية للوصول إلى النظام. يرجى التواصل مع مدير النظام للحصول على دعوة.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toHaveCount(0);
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'رؤية' })).toBeVisible();
});

test('the theme toggle flips the document class and the choice survives a reload', async ({ page }) => {
  await stubSupabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  const html = page.locator('html');
  await expect(html).toHaveClass(/\blight\b/);
  await expect(html).not.toHaveClass(/\bdark\b/);
  await page.getByRole('button', { name: 'تبديل الوضع' }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(html).not.toHaveClass(/\blight\b/);
  expect(await page.evaluate(() => window.localStorage.getItem('theme'))).toBe('dark');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await expect(html).toHaveClass(/\bdark\b/);
  await page.getByRole('button', { name: 'تبديل الوضع' }).click();
  await expect(html).toHaveClass(/\blight\b/);
  expect(await page.evaluate(() => window.localStorage.getItem('theme'))).toBe('light');
});
