import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, FUND_ID, PROJECT_ID, USER_ID, seed } from './support/seed';

/**
 * «الكشف المالي الموحّد» downloads from the company page in the owner's
 * layout, and its figures are the page's: the actual spend leaves out the
 * rejected expense, the collected sum leaves out what is only invoiced, and
 * the movements sheet adds up to the same actual spend. A paid advance writes
 * no expense, so what is still out on it (6,000 less 1,000 returned) shows
 * as «سلف قائمة», read from the payment request.
 */
const rows = {
  projects: [{ ...seed.projects[0], id: 'p-2', name: 'مشروع الميناء', contract_value: 200000 }],
  expenses: [
    { id: 'ex-2', project_id: 'p-2', category: 'hospitality', description: 'قاعة', amount: 3000, date: '2026-03-05', month: 3, approval_status: 'approved', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-05T00:00:00Z' },
    { id: 'ex-rej', project_id: PROJECT_ID, category: 'other', description: 'مرفوض', amount: 70000, date: '2026-03-06', month: 3, approval_status: 'rejected', is_vat_exempt: true, user_id: USER_ID, created_at: '2026-03-06T00:00:00Z' },
  ],
  payment_requests: [{
    id: 'pr-adv', project_id: PROJECT_ID, resource_id: null, request_type: 'advance', amount: 6000, currency: 'SAR', description: 'سلفة ميدانية',
    justification: null, linked_reimbursement_ids: [], linked_fund_id: null, paid_from_fund_id: FUND_ID, paid_from_custody_id: null,
    budget_item_id: null, priority: 'normal', status: 'paid', requested_by: USER_ID, requested_at: '2026-02-03T00:00:00Z', reviewed_by: null,
    reviewed_at: null, review_notes: null, approved_by: USER_ID, approved_at: '2026-02-04T00:00:00Z', approval_notes: null, scheduled_date: null,
    paid_date: '2026-02-05', payment_method: 'cash', payment_reference: null, payment_attachments: [], rejection_reason: null,
    auto_created_expense_id: null, is_advance_outstanding: true, advance_settled_at: null, advance_settled_by: null,
    settlement_type: null, settled_amount: null, refunded_amount: 1000, settlement_notes: null, refund_to_fund_id: null, refund_to_custody_id: null,
    created_at: '2026-02-03T00:00:00Z', updated_at: '2026-02-05T00:00:00Z',
  }],
  revenues: [
    { id: 'rv-1', project_id: PROJECT_ID, description: 'دفعة أولى', amount: 50000, date: '2026-02-01', month: 1, revenue_type: 'milestone', status: 'collected', collection_date: '2026-02-03', user_id: USER_ID, created_at: '2026-02-01T00:00:00Z' },
    { id: 'rv-2', project_id: PROJECT_ID, description: 'مفوترة', amount: 9000, date: '2026-03-01', month: 2, revenue_type: 'milestone', status: 'invoiced', user_id: USER_ID, created_at: '2026-03-01T00:00:00Z' },
  ],
};

test('the unified statement downloads in the owner layout with the page figures', async ({ page }) => {
  await stubSupabase(page, rows);
  await page.goto(`/company/${COMPANY_ID}`);
  await expect(page.getByRole('heading', { name: 'شركة الاختبار' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'الكشف الموحّد' }).click();
  const path = await (await download).path();
  const files = unzipSync(new Uint8Array(readFileSync(path!)));
  const text = (name: string) => strFromU8(files[name] ?? new Uint8Array());

  const workbook = text('xl/workbook.xml');
  for (const sheet of ['شركة الاختبار — المجمّع', 'مشروع الاختبار', 'مشروع الميناء', 'مصدر_الحقيقة', 'التحصيل']) {
    expect(workbook).toContain(`name="${sheet}"`);
  }

  // Strings may sit in the shared table or inline; numbers sit in <v>.
  const all = Object.keys(files).filter((f) => f.startsWith('xl/')).map(text).join('\n');
  const numbers = (sheet: string) => [...text(`xl/worksheets/${sheet}.xml`).matchAll(/<v>([-\d.]+)<\/v>/g)].map((m) => Number(m[1]));
  expect(all).toContain('مقارنة المشاريع');
  expect(all).toContain('قاعات وضيافة');

  // Combined sheet: actual 12,000 + 3,000 (the rejected 70,000 left out), collected 50,000 (the invoiced 9,000 left out).
  const combined = numbers('sheet1');
  expect(combined).toContain(15000);
  expect(combined).toContain(50000);
  expect(combined).toContain(35000);
  expect(combined).not.toContain(70000);
  expect(combined).not.toContain(85000);
  expect(combined).toContain(5000); // the open advance, beside the figures and not inside them

  // The movements sheet ends on the same actual spend.
  const source = numbers('sheet4');
  expect(source[source.length - 1]).toBe(15000);
  expect(source).not.toContain(70000);
});
