import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { PROJECT_ID, USER_ID } from './support/seed';

/**
 * The executive insights card on the overview. Pressing the button hands
 * the function the project as it stands, in figures, and renders what
 * comes back under its three headings; a refusal in the answer, or a
 * failed call, reads in the card and as a toast, and the button offers
 * to try again.
 */
const calls = (wire: { writes: { method: string; table: string; body: unknown }[] }) =>
  wire.writes.filter((w) => w.method === 'INVOKE' && w.table === 'ai-executive-summary').map((w) => w.body as Record<string, unknown>);

async function openOverview(page: Page) {
  await page.goto(`/project/${PROJECT_ID}`);
  await expect(page.getByText('مشروع الاختبار').first()).toBeVisible();
  await expect(page.getByText('رؤى تنفيذية ذكية')).toBeVisible();
  // The context is the project as loaded; the lists arrive together, so the seed's spend on screen means they are in.
  await expect(page.getByText('12,000.00 ر.س').first()).toBeVisible();
  // The card is three levels above its heading: title row, header, card.
  return page.getByRole('heading', { name: 'رؤى تنفيذية ذكية' }).locator('xpath=ancestor::div[3]');
}

test('hands the function the project in figures and renders the answer under its headings', async ({ page }) => {
  const wire = await stubSupabase(page, {
    risks: [{ id: 'r-1', project_id: PROJECT_ID, portfolio_id: null, user_id: USER_ID, title: 'نزاع', description: null, probability: 'high', impact: 'high',
      financial_impact: 20000, category: 'financial', status: 'open', mitigation_plan: null, owner: null, created_at: '2026-02-01T00:00:00Z' }],
  }, {
    'ai-executive-summary': () => ({
      headline: 'المشروع في مساره مع هامش مريح',
      highlights: ['الصرف 3% من الخطة', 'العقد مغطّى بالكامل'],
      concerns: ['خطر مفتوح عالي الأثر'],
      recommendations: ['خطة تخفيف للنزاع قبل الشهر القادم'],
    }),
  });
  const card = await openOverview(page);
  await card.getByRole('button', { name: 'توليد ملخص ذكي' }).click();

  await expect(card.getByText('المشروع في مساره مع هامش مريح')).toBeVisible();
  await expect(card.getByText('✓ نقاط قوة').locator('..')).toContainText('العقد مغطّى بالكامل');
  await expect(card.getByText('⚠ مخاوف').locator('..')).toContainText('خطر مفتوح عالي الأثر');
  await expect(card.getByText('→ توصيات').locator('..')).toContainText('خطة تخفيف للنزاع قبل الشهر القادم');
  await expect(card.getByRole('button', { name: 'إعادة التحليل' })).toBeVisible();

  expect(calls(wire)).toHaveLength(1);
  expect(calls(wire)[0]).toMatchObject({
    name: 'مشروع الاختبار', status: 'active', percentComplete: 40, durationMonths: 12,
    contractValue: 1000000, effectiveContractValue: 1000000, totalPlanned: 400000, totalActual: 12000,
    collectedRevenue: 0, invoicedRevenue: 0, spendRate: 3, plannedProfit: 600000,
    openRisks: 1, highRisks: 1, pendingExpenses: 0, pendingChangeOrders: 0, delayedMilestones: 0, currency: 'SAR',
  });
});

test('a refusal in the answer reads in the card and as a toast, and the button offers another try', async ({ page }) => {
  await stubSupabase(page, {}, { 'ai-executive-summary': () => ({ error: 'مفتاح الذكاء الاصطناعي غير مضبوط' }) });
  const card = await openOverview(page);
  await card.getByRole('button', { name: 'توليد ملخص ذكي' }).click();
  await expect(card.getByText('مفتاح الذكاء الاصطناعي غير مضبوط')).toBeVisible();
  await expect(page.getByText('مفتاح الذكاء الاصطناعي غير مضبوط')).toHaveCount(2);
  await expect(card.getByRole('button', { name: 'إعادة التحليل' })).toBeVisible();
  await expect(card.getByText('✓ نقاط قوة')).toHaveCount(0);
});
