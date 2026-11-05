import { test, expect } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, FUND_ID, PROJECT_ID, SETTLEMENT_ID, USER_ID, seed } from './support/seed';

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
  await dialog.getByRole('radio', { name: /تمويل مشروع/ }).click();
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
  // The project can spend it: the funding arrives as a fund, even while the seed's fund is still open.
  const fund = wire.writes.find((w) => w.method === 'POST' && w.table === 'project_funds')?.body as Record<string, unknown>;
  expect(fund).toMatchObject({ project_id: PROJECT_ID, amount: 60000 });
  expect(String(fund.notes)).toContain('تمويل من قرض محمود عبر المنظومة');
  // Linked to the funding movement, so neither can be deleted without the other; no emergency label.
  expect(String(fund.ledger_entry_id)).toMatch(/^created-intercompany_entries-/);
  expect(String(fund.notes)).not.toContain('استثنائية');
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
  const form = page.getByRole('dialog', { name: 'سلفة أو سداد' });
  await expect(form.getByLabel('مبلغ الحركة')).toHaveValue('40000');
  await expect(form.getByRole('combobox', { name: 'الدفعة التي يخرج منها النقد' })).toContainText('الدفعة رقم 1 · بقي فيها 38,000.00');
  await form.getByRole('button', { name: 'حفظ الحركة' }).click();
  await expect(page.getByText('تم تسجيل السداد')).toBeVisible();
  const post = wire.writes.find((w) => w.method === 'POST' && w.table === 'intercompany_entries')?.body;
  // The cash leaves the project's open fund: a repayment, not an expense.
  expect(post).toMatchObject({ from_kind: 'project', from_id: PROJECT_ID, to_kind: 'company', amount: 40000, type: 'repayment', source_fund_id: FUND_ID });
});

test('a loan for the company\'s own spend stays with it, and is flagged before it falls due', async ({ page }) => {
  // Five days from today as the app counts days: on Riyadh's calendar, not UTC's.
  const soon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date(Date.now() + 5 * 86_400_000));
  const wire = await stubSupabase(page, { ...ledger, parties: [owner], intercompany_entries: [] });
  await page.goto(`/company/${COMPANY_ID}`);
  const section = page.getByRole('region', { name: 'المالية العامة للمنظومة' });
  await section.getByRole('button', { name: 'قرض', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /قرض للمنظومة/ });
  await dialog.getByRole('combobox', { name: 'المُقرض' }).click();
  await page.getByRole('option', { name: /محمود/ }).click();
  await dialog.getByLabel('مبلغ القرض *').fill('25000');
  await dialog.getByLabel('موعد السداد').fill(soon);
  await expect(dialog.getByRole('radio', { name: /مصاريف المنظومة/ })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('status')).toContainText('لمصاريفها');
  await dialog.getByRole('button', { name: 'حفظ القرض' }).click();
  await expect(page.getByText('سُجّل القرض', { exact: true })).toBeVisible();

  const post = wire.writes.find((w) => w.method === 'POST' && w.table === 'intercompany_entries')!.body as unknown[];
  expect(post).toHaveLength(1);
  expect(post[0]).toMatchObject({ from_kind: 'party', to_kind: 'company', amount: 25000, due_date: soon });
  // Plain words up top, and the due date flagged.
  await expect(section.getByLabel('الخلاصة ببساطة')).toContainText('المنظومة عليها لـمحمود 25,000.00');
  await section.getByRole('button', { name: /تنبيه قرض واحد ينتظرك/ }).click();
  await expect(section.getByRole('alert')).toContainText('يستحق سداد قرض محمود بعد 5 أيام');
});

test('the whole loan closes: funded, collected, recovered, repaid, and a repayment beyond the debt is refused', async ({ page }) => {
  const wire = await stubSupabase(page, {
    ...ledger, parties: [owner],
    intercompany_entries: [
      entry('loan', ['party', OWNER], ['company', null], 50000, 'advance', 'قرض'),
      entry('fund', ['company', null], ['project', PROJECT_ID], 50000, 'advance', 'تمويل من قرض محمود'),
    ],
    revenues: [{ id: 'r1', project_id: PROJECT_ID, description: 'دفعة', amount: 80000, date: '2026-03-01', month: 3,
      revenue_type: 'milestone', status: 'collected', collection_date: '2026-03-01', user_id: USER_ID, created_at: '2026-03-01T00:00:00Z' }],
  });
  // The project sees what it owes the company, and that it can pay it back now.
  await page.goto(`/project/${PROJECT_ID}?group=finance&tab=funds`);
  const card = page.getByRole('region', { name: 'تمويل من المنظومة' });
  await expect(card).toContainText('50,000.00');
  await expect(card.getByRole('status')).toContainText('يمكن رد 50,000.00');

  await card.getByRole('link', { name: /صفحة المنظومة/ }).click();
  const section = page.getByRole('region', { name: 'المالية العامة للمنظومة' });
  await section.getByRole('button', { name: /تنبيه/ }).click();
  await section.getByRole('button', { name: /استرداد 50,000\.00/ }).click();
  let form = page.getByRole('dialog', { name: 'سلفة أو سداد' });
  // More than the project owes is refused.
  await form.getByLabel('مبلغ الحركة').fill('60000');
  await form.getByRole('button', { name: 'حفظ الحركة' }).click();
  await expect(page.getByText(/المبلغ أكبر مما على مشروع الاختبار لـالمنظومة \(50,000\.00/)).toBeVisible();
  await form.getByLabel('مبلغ الحركة').fill('50000');
  await form.getByRole('button', { name: 'حفظ الحركة' }).click();
  await expect(page.getByText('تم تسجيل السداد')).toBeVisible();

  // The money is back with the company: it offers it to the lender.
  await section.getByRole('alert').filter({ hasText: 'لسداد محمود' }).getByRole('button', { name: /سداد 50,000\.00/ }).click();
  form = page.getByRole('dialog', { name: 'سلفة أو سداد' });
  await form.getByRole('button', { name: 'حفظ الحركة' }).click();
  await expect(page.getByText('تم تسجيل السداد')).toHaveCount(1);
  await expect(section.getByRole('article', { name: 'قرض محمود' })).toContainText('مسدَّد');
  await expect(section.getByLabel('الخلاصة ببساطة')).toContainText('لا أحد مدين لأحد الآن');

  const posts = wire.writes.filter((w) => w.method === 'POST' && w.table === 'intercompany_entries').map((w) => w.body);
  expect(posts).toEqual([
    expect.objectContaining({ from_kind: 'project', to_kind: 'company', amount: 50000, type: 'repayment' }),
    expect.objectContaining({ from_kind: 'company', to_kind: 'party', to_id: OWNER, amount: 50000, type: 'repayment' }),
  ]);
});

test('cash left at the last settlement waits in the project, and goes back to the company once it has finished', async ({ page }) => {
  const wire = await stubSupabase(page, { ...ledger, parties: [owner], intercompany_entries: [] });
  // The seed's fund, settled with 224 still in hand and nothing to carry it into; the project done.
  await page.route('**/rest/v1/project_funds*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: FUND_ID, project_id: PROJECT_ID, fund_number: 1, amount: 5000, transfer_date: '2026-02-01', status: 'settled', notes: null,
      created_by: USER_ID, acknowledged_at: null, acknowledged_by: null, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', carried_in: 0,
    }]) });
  });
  await page.route('**/rest/v1/fund_settlements*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: SETTLEMENT_ID, fund_id: FUND_ID, project_id: PROJECT_ID, total_received: 5000, total_spent: 4776, remaining_cash: 224, difference: 0,
      status: 'approved', carry_status: 'pending', attachments: [], created_at: '2026-03-02T00:00:00Z', updated_at: '2026-03-02T00:00:00Z',
    }]) });
  });
  await page.route('**/rest/v1/projects*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seed.projects.map((r) => ({ ...r, status: 'completed' }))) });
  });
  await page.goto(`/project/${PROJECT_ID}?group=finance&tab=funds`);
  const card = page.getByRole('region', { name: 'متبقٍ من تسويات سابقة' });
  await expect(card).toContainText('انتهى المشروع ولا دفعة تالية');
  await expect(card).toContainText('224.00');
  await card.getByRole('button', { name: /أعده للمنظومة/ }).click();
  await expect(page.getByText('أُعيد المتبقي للمنظومة')).toBeVisible();
  const post = wire.writes.find((w) => w.method === 'POST' && w.table === 'intercompany_entries')?.body;
  expect(post).toMatchObject({ from_kind: 'project', from_id: PROJECT_ID, to_kind: 'company', amount: 224, type: 'repayment', source_fund_id: FUND_ID });
  expect(wire.writes.find((w) => w.method === 'PATCH' && w.table === 'fund_settlements')?.body).toEqual({ carry_status: 'returned' });
});
