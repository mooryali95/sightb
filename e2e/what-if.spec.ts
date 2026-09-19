import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID } from './support/seed';

/**
 * The what-if analysis on the tracking tab. It opens on the project as it
 * stands (1,000,000 contract, 400,000 planned, 12,000 spent, 40% done over
 * 12 months) and the four sliders rework the four result cards, the
 * difference against the original, the loss warning and the reset button.
 * The keyboard moves a slider: End and Home to its ends, PageUp a tenth.
 */
async function openWhatIf(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await page.getByRole('tab', { name: 'المتابعة' }).click();
  const header = page.getByRole('button', { name: 'ما-إذا', exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(page.getByRole('heading', { name: 'تحليل ما-إذا (What-If)' })).toBeVisible();
}
// Scoped to the section: the charts section beside it names the budget remainder too.
const section = (page: Page) => page.getByRole('region', { name: 'ما-إذا' });
const card = (page: Page, title: string) => section(page).getByText(title, { exact: true }).locator('..');
const slider = (page: Page, i: number) => page.getByRole('slider').nth(i);
async function move(page: Page, i: number, key: 'End' | 'Home' | 'PageUp') {
  await slider(page, i).focus();
  await page.keyboard.press(key);
}

test('opens on the project as it stands', async ({ page }) => {
  await stubSupabase(page);
  await openWhatIf(page);
  await expect(page.getByRole('slider')).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(slider(page, i)).toHaveAttribute('aria-valuenow', '0');
  await expect(card(page, 'الربح المتوقع')).toContainText('600,000.00 ر.س');
  await expect(card(page, 'الربح المتوقع')).toContainText('هامش: 60.0%');
  await expect(card(page, 'المتبقي من الموازنة')).toContainText('388,000.00 ر.س');
  await expect(card(page, 'المتبقي من الموازنة')).toContainText('11.6 شهر متبقي');
  await expect(card(page, 'مؤشر CPI')).toContainText('13.33');
  await expect(card(page, 'التكلفة المقدرة (EAC)')).toContainText('30,000.00 ر.س');
  await expect(page.getByRole('button', { name: 'إعادة ضبط' })).toHaveCount(0);
  await expect(page.getByText('عن الأصلي')).toHaveCount(0);
});

test('the sliders rework the cards, the difference, the warning and the reset', async ({ page }) => {
  await stubSupabase(page);
  await openWhatIf(page);

  // Contract +50%: 1,500,000 against the 400,000 plan.
  await move(page, 0, 'End');
  await expect(slider(page, 0)).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByText('1,500,000.00 ر.س', { exact: true })).toBeVisible();
  await expect(card(page, 'الربح المتوقع')).toContainText('1,100,000.00 ر.س');
  await expect(card(page, 'الربح المتوقع')).toContainText('هامش: 73.3%');
  await expect(card(page, 'الربح المتوقع')).toContainText('+500,000.00 ر.س عن الأصلي');
  await expect(page.getByRole('button', { name: 'إعادة ضبط' })).toBeVisible();

  // Contract +10% instead: PageUp from the bottom is a tenth of the range.
  await move(page, 0, 'Home');
  await expect(slider(page, 0)).toHaveAttribute('aria-valuenow', '-50');
  await move(page, 0, 'PageUp');
  await expect(slider(page, 0)).toHaveAttribute('aria-valuenow', '-40');
  await expect(card(page, 'الربح المتوقع')).toContainText('200,000.00 ر.س');

  // Contract -50% with spend +50%: a 500,000 contract against a 600,000 plan is a loss.
  await move(page, 0, 'Home');
  await move(page, 1, 'End');
  await expect(card(page, 'الربح المتوقع')).toContainText('هامش: -20.0%');
  await expect(page.getByText('تحذير: هذا السيناريو يؤدي إلى خسارة بقيمة 100,000.00 ر.س')).toBeVisible();
  // The difference is against the original 600,000, not against the reworked plan.
  await expect(card(page, 'الربح المتوقع')).toContainText(/700,000\.00 ر\.س عن الأصلي/);
  // Spend +50% moves the actuals to 18,000 but not the BAC, so CPI is 160,000 / 18,000.
  await expect(card(page, 'مؤشر CPI')).toContainText('8.89');
  await expect(card(page, 'التكلفة المقدرة (EAC)')).toContainText('67,500.00 ر.س');
  await expect(card(page, 'المتبقي من الموازنة')).toContainText('582,000.00 ر.س');

  // Twelve more months: the same remainder over a slower burn.
  await move(page, 2, 'End');
  await expect(page.getByText('24 شهر', { exact: true })).toBeVisible();
  await expect(card(page, 'المتبقي من الموازنة')).toContainText('23.3 شهر متبقي');

  await page.getByRole('button', { name: 'إعادة ضبط' }).click();
  for (let i = 0; i < 4; i++) await expect(slider(page, i)).toHaveAttribute('aria-valuenow', '0');
  await expect(card(page, 'الربح المتوقع')).toContainText('600,000.00 ر.س');
  await expect(page.getByText('عن الأصلي')).toHaveCount(0);
  await expect(page.getByText(/^تحذير/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'إعادة ضبط' })).toHaveCount(0);

  // The duration alone counts as a change too.
  await move(page, 2, 'End');
  await expect(page.getByRole('button', { name: 'إعادة ضبط' })).toBeVisible();
});
