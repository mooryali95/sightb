import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';

/**
 * The app refuses to run inside another site's frame. The hosting sends
 * neither X-Frame-Options nor a frame-ancestors policy, so without this any
 * page could load the app in a hidden frame and steer a signed-in person's
 * clicks (an approval, a payment) by laying its own buttons over it. Framed,
 * the app shows a notice and a link that opens it on its own instead; loaded
 * directly, it runs as always.
 */
// The framing page is served on the app's own origin. The guard treats any
// frame alike whatever its origin (the allowed hosts are unit-tested), and
// this Chromium refuses the other set-ups for reasons of its own: a public
// origin may not frame a loopback address (Private Network Access), and a
// blank parent denies the frame its storage, so the app never loads there.
const PARENT = '/__framing-page';

test('inside another page\'s frame the app shows a notice, not the sign-in form', async ({ page, baseURL }) => {
  await stubSupabase(page);
  await page.route(`${baseURL}${PARENT}`, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><iframe title="framed" src="${baseURL}/login" width="900" height="700"></iframe>`,
  }));
  await page.goto(PARENT);
  const framed = page.frameLocator('iframe[title="framed"]');
  await expect(framed.getByText('لا يعمل النظام داخل إطار صفحة أخرى')).toBeVisible();
  await expect(framed.getByRole('link', { name: 'افتح النظام في نافذة مستقلة' })).toHaveAttribute('href', `${baseURL}/login`);
  await expect(framed.getByLabel('البريد الإلكتروني')).toHaveCount(0);
});

test('loaded directly, the sign-in form is there as always', async ({ page }) => {
  await stubSupabase(page);
  await page.goto('/login');
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  await expect(page.getByText('لا يعمل النظام داخل إطار صفحة أخرى')).toHaveCount(0);
});
