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

test('opened straight from the company, a custody topped up by a transfer is judged with the transfer, not as overspent', async ({ page }) => {
  const CUSTODY = '99999999-9999-4999-8999-999999999999';
  await stubSupabase(page, {
    custodies: [{ id: CUSTODY, project_id: PROJECT_ID, company_id: null, resource_name: 'عهدة المشتريات', amount: 5000, status: 'active',
      notes: null, received_date: '2026-03-01', closed_date: null, source_fund_id: null, user_id: USER_ID, created_at: '2026-03-01T00:00:00Z' }],
    cash_transfers: [{ id: 'tr1', project_id: PROJECT_ID, from_fund_id: '33333333-3333-4333-8333-333333333333', to_custody_id: CUSTODY, amount: 3000,
      transfer_date: '2026-03-05', notes: null, user_id: USER_ID, created_at: '2026-03-05T00:00:00Z' }],
    expenses: [{ id: 'ec', project_id: PROJECT_ID, category: 'other', description: 'مشتريات', amount: 7000, date: '2026-03-10', month: 3,
      approval_status: 'approved', is_vat_exempt: true, custody_id: CUSTODY, user_id: USER_ID, created_at: '2026-03-10T00:00:00Z' }],
  });
  await page.goto(`/company/${COMPANY_ID}`);
  const card = page.getByRole('region', { name: 'سلامة البيانات' });
  await expect(card).toContainText('الحسابات مغلقة');
  await expect(card).not.toContainText('أكثر من رصيدها');
});

test('when the books cannot be loaded, no verdict is given', async ({ page }) => {
  await stubSupabase(page);
  await page.route('**/rest/v1/cash_transfers*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"down"}' }));
  await page.goto(`/company/${COMPANY_ID}`);
  const card = page.getByRole('region', { name: 'سلامة البيانات' });
  await expect(card.getByRole('alert')).toContainText('تعذّر تحميل بيانات الفحص');
  await expect(card).not.toContainText('الحسابات مغلقة');
});
