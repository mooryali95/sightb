import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID, USER_ID } from './support/seed';

/**
 * A loan goes through the company: the owner lends the company, the company
 * funds the project in the same step, and once the project collects, the
 * company page says it is time to recover, with the repayment prefilled.
 */
const OWNER = 'aaaaaaaa-0000-4000-8000-0000000000aa';
const owner = { id: OWNER, company_id: COMPANY_ID, name: 'محمود', kind: 'owner', archived: false, role: null, aliases: [], user_id: USER_ID, created_at: '2026-01-01T00:00:00Z' };
const ledger = { company_expenses: [], company_expense_allocations: [] };
const entry = (id: string, from: [string, string | null], to: [string, string | null], amount: number, type: string, note: string) => ({
  id, company_id: COMPANY_ID, date: id === 'loan' ? '2026-01-01' : '2026-01-02', amount, type, note, due_date: null, salary_expense_id: null,
  from_kind: from[0], from_id: from[1], to_kind: to[0], to_id: to[1], user_id: USER_ID, created_at: '2026-01-01T00:00:00Z',
});

test('a loan from the owner funds the project in one step', async ({ page }) => {
  const wire = await stubSupabase(page, { ...ledger, parties: [owner], intercompany_entries: [] });
  await page.goto(`/company/${COMPANY_ID}`);
  const section = page.getByRole('region', { name: 'المالية العامة للمنظومة' });
  await section.getByRole('button', { name: 'قرض', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /قرض للمنظومة/ });
  await dialog.getByRole('combobox', { name: 'المُقرض' }).click();
  await page.getByRole('option', { name: /محمود/ }).click();
  await dialog.getByLabel('مبلغ القرض *').fill('100000');
  await dialog.getByLabel('مبلغ التمويل').fill('60000');
  await expect(dialog.getByRole('status')).toContainText('يبقى 40,000.00');
  await dialog.getByRole('button', { name: 'حفظ القرض' }).click();
  await expect(page.getByText('سُجّل القرض وتمويل «مشروع الاختبار»')).toBeVisible();

  const posts = wire.writes.filter((w) => w.method === 'POST' && w.table === 'intercompany_entries');
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toEqual([
    expect.objectContaining({ from_kind: 'party', from_id: OWNER, to_kind: 'company', to_id: null, amount: 100000, type: 'advance', note: 'قرض' }),
    expect.objectContaining({ from_kind: 'company', from_id: null, to_kind: 'project', to_id: PROJECT_ID, amount: 60000, type: 'advance' }),
  ]);
});

test('once the funded project collects, the company page asks to recover, prefilled', async ({ page }) => {
  const wire = await stubSupabase(page, {
    ...ledger, parties: [owner],
    intercompany_entries: [
      entry('loan', ['party', OWNER], ['company', null], 100000, 'advance', 'قرض'),
      entry('fund', ['company', null], ['project', PROJECT_ID], 100000, 'advance', 'تمويل من قرض محمود'),
    ],
    revenues: [{ id: 'r1', project_id: PROJECT_ID, description: 'دفعة أولى', amount: 40000, date: '2026-03-01', month: 3,
      revenue_type: 'milestone', status: 'collected', collection_date: '2026-03-01', user_id: USER_ID, created_at: '2026-03-01T00:00:00Z' }],
  });
  await page.goto(`/company/${COMPANY_ID}`);
  const section = page.getByRole('region', { name: 'المالية العامة للمنظومة' });
  await section.getByRole('button', { name: /تنبيه قرض واحد ينتظرك/ }).click();
  await expect(section.getByRole('article', { name: 'قرض محمود' })).toContainText('100,000.00');
  const alert = section.getByRole('alert').filter({ hasText: 'حان استرداد التمويل من «مشروع الاختبار»' });
  await alert.getByRole('button', { name: /استرداد 40,000\.00/ }).click();
  const form = page.getByRole('dialog', { name: 'حركة ذمم' });
  await expect(form.getByLabel('مبلغ الحركة')).toHaveValue('40000');
  await form.getByRole('button', { name: 'حفظ الحركة' }).click();
  await expect(page.getByText('تم تسجيل السداد')).toBeVisible();
  const post = wire.writes.find((w) => w.method === 'POST' && w.table === 'intercompany_entries')?.body;
  expect(post).toMatchObject({ from_kind: 'project', from_id: PROJECT_ID, to_kind: 'company', amount: 40000, type: 'repayment' });
});
