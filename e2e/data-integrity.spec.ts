import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID } from './support/seed';

/**
 * The company page checks its own books every time it opens: the seed's
 * books close, and an expense with no source is named with its project and
 * amount, linked to the project.
 */
test('the company page says the books close, and names an amount with no source', async ({ page }) => {
  await stubSupabase(page);
  await page.goto(`/company/${COMPANY_ID}`);
  const card = page.getByRole('region', { name: 'سلامة البيانات' });
  await expect(card).toContainText('الحسابات مغلقة');
});

test('an expense with no fund and no custody is flagged with its amount', async ({ page }) => {
  await stubSupabase(page, {
    expenses: [{ id: 'orphan', project_id: PROJECT_ID, category: 'other', description: 'حفل الختام', amount: 5000, date: '2026-05-14', month: 4,
      approval_status: 'approved', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-05-14T00:00:00Z' }],
  });
  await page.goto(`/company/${COMPANY_ID}`);
  const card = page.getByRole('region', { name: 'سلامة البيانات' });
  await expect(card).toContainText('ملاحظة واحدة تحتاج تصحيحاً');
  await expect(card).toContainText('«حفل الختام» بلا مصدر');
  await expect(card).toContainText('5,000.00');
  await expect(card.getByRole('link', { name: 'مشروع الاختبار' })).toHaveAttribute('href', `/project/${PROJECT_ID}`);
});
