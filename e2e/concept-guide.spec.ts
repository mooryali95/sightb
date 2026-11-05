import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';

/**
 * A newcomer meets the guide once on the dashboard; reading or dismissing it
 * puts it away for good, and the sidebar opens it again any time.
 */
test('shown once to a newcomer, put away for good, and always in the sidebar', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('guide-test')) { sessionStorage.setItem('guide-test', '1'); localStorage.setItem('rouya_concept_guide_seen', '0'); } });
  await stubSupabase(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'جديد على النظام؟' });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'اقرأ الدليل' }).click();
  const dialog = page.getByRole('dialog', { name: 'دليل المفاهيم' });
  await expect(dialog).toContainText('السلفة');
  await expect(dialog).toContainText('ولا تُحسب مصروفاً قبل ذلك');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'إدارة الشركات' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'جديد على النظام؟' })).toHaveCount(0);

  await page.getByRole('button', { name: 'دليل المفاهيم' }).click();
  await expect(page.getByRole('dialog', { name: 'دليل المفاهيم' })).toContainText('الالتزام');
});
