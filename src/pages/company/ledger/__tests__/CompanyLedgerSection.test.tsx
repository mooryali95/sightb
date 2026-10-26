/**
 * The company ledger on the company page: waiting for activation until the
 * migration is applied, then the four figures, the "belongs to the company ·
 * charged to project X" line under each expense, the balances with the
 * right direction, and the expense form's suggested split and refusal of an
 * over-allocation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CompanyLedger } from '@/services/companyLedgerService';
import { CompanyLedgerSection } from '../CompanyLedgerSection';

const svc = vi.hoisted(() => ({
  loadCompanyLedger: vi.fn(),
  createCompanyExpense: vi.fn().mockResolvedValue(undefined),
  createParty: vi.fn(),
  createEntry: vi.fn().mockResolvedValue(undefined),
  deleteCompanyExpense: vi.fn().mockResolvedValue(undefined),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/companyLedgerService', async () => {
  const real = await vi.importActual<typeof import('@/services/companyLedgerService')>('@/services/companyLedgerService');
  return { ...svc, LedgerNotReady: real.LedgerNotReady };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

const projects = [{ id: 'p1', name: 'برج الأفق', weight: 3_000_000 }, { id: 'p2', name: 'مجمع المدار', weight: 1_000_000 }];
const ledger: CompanyLedger = {
  parties: [
    { id: 'omar', companyId: 'c1', name: 'عمر', kind: 'owner', archived: false },
    { id: 'ayman', companyId: 'c1', name: 'أيمن', kind: 'person', archived: false },
  ],
  expenses: [
    { id: 'e1', companyId: 'c1', date: '2026-10-01', amount: 10000, description: 'راتب أكتوبر', kind: 'salary', partyId: 'ayman', paidByPartyId: null },
    { id: 'e2', companyId: 'c1', date: '2026-10-02', amount: 2000, description: 'إيجار المكتب', kind: 'rent', partyId: null, paidByPartyId: 'omar' },
  ],
  allocations: [{ id: 'a1', expenseId: 'e1', projectId: 'p1', amount: 6000 }],
  entries: [
    { id: 'm1', companyId: 'c1', date: '2026-10-03', amount: 3000, type: 'advance', from: { kind: 'company', id: null }, to: { kind: 'party', id: 'ayman' }, note: '', dueDate: null, salaryExpenseId: null },
    { id: 'm2', companyId: 'c1', date: '2026-10-04', amount: 40000, type: 'advance', from: { kind: 'company', id: null }, to: { kind: 'project', id: 'p2' }, note: 'تمويل', dueDate: null, salaryExpenseId: null },
  ],
};

function renderSection(canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CompanyLedgerSection companyId="c1" projects={projects} canEdit={canEdit} /></QueryClientProvider>);
}
const card = (title: string) => screen.getByText(title, { exact: true }).closest('.stat-card') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  svc.loadCompanyLedger.mockResolvedValue(ledger);
});

describe('CompanyLedgerSection', () => {
  it('waits for activation, without an error, while the tables are missing', async () => {
    const { LedgerNotReady } = await import('@/services/companyLedgerService');
    svc.loadCompanyLedger.mockRejectedValue(new LedgerNotReady());
    renderSection();
    expect(await screen.findByText(/بانتظار التفعيل/)).toBeInTheDocument();
    expect(screen.queryByText(/تعذّر/)).not.toBeInTheDocument();
  });

  it('shows the company\'s spend, the part projects carry, what stays, and the net of what is owed', async () => {
    renderSection();
    await screen.findByText('راتب أكتوبر');
    expect(card('مصاريف المنظومة')).toHaveTextContent('12,000.00');
    expect(card('محمَّل على المشاريع')).toHaveTextContent('6,000.00');
    expect(card('محمَّل على المشاريع')).toHaveTextContent('50% من مصاريف المنظومة');
    expect(card('باقٍ على المنظومة')).toHaveTextContent('6,000.00');
    // Owed to the company: Ayman 3,000 + project 40,000; owed by it: Omar's 2,000 rent.
    expect(card('الصافي: لنا أو علينا')).toHaveTextContent('لنا عند الغير 43,000.00 ر.س · علينا للغير 2,000.00 ر.س');
  });

  it('says under each expense what belongs to the company and what was charged where', async () => {
    renderSection();
    const salary = (await screen.findByText('راتب أكتوبر')).closest('tr')!;
    expect(salary).toHaveTextContent('يتبع المنظومة · حُمِّل 6,000.00 ر.س على برج الأفق · يبقى 4,000.00 ر.س');
    const rent = screen.getByText('إيجار المكتب').closest('tr')!;
    expect(rent).toHaveTextContent('يتبع المنظومة بالكامل');
    expect(rent).toHaveTextContent('دفعه عمر من جيبه — ذمة له');
  });

  it('lists each balance with its direction and opens its statement', async () => {
    renderSection();
    await screen.findByText('راتب أكتوبر');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /من له ومن عليه/ }));
    fireEvent.click(screen.getByRole('tab', { name: /من له ومن عليه/ }));
    const project = (await screen.findByText('مجمع المدار')).closest('.stat-card') as HTMLElement;
    expect(project).toHaveTextContent('لنا');
    expect(project).toHaveTextContent('مجمع المدار مدين للمنظومة');
    const omar = screen.getByText('عمر').closest('.stat-card') as HTMLElement;
    expect(omar).toHaveTextContent('علينا');
    expect(omar).toHaveTextContent('المنظومة مدينة لـعمر');
    fireEvent.click(within(project).getByRole('button', { name: 'كشف الحساب' }));
    expect(await screen.findByText('كشف حساب — مجمع المدار')).toBeInTheDocument();
    expect(screen.getByText('سلفة — تمويل')).toBeInTheDocument();
  });

  it('hides the write buttons from someone who can only read', async () => {
    renderSection(false);
    await screen.findByText('راتب أكتوبر');
    expect(screen.queryByRole('button', { name: /مصروف منظومة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /سلفة أو سداد/ })).not.toBeInTheDocument();
  });

  it('suggests a split by contract value and refuses charging more than the amount', async () => {
    renderSection();
    await screen.findByText('راتب أكتوبر');
    fireEvent.click(screen.getByRole('button', { name: /مصروف منظومة/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('المبلغ'), { target: { value: '8000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /اقتراح حسب قيمة العقد/ }));
    expect(within(dialog).getByLabelText('مبلغ السطر 1')).toHaveValue(6000);
    expect(within(dialog).getByLabelText('مبلغ السطر 2')).toHaveValue(2000);
    expect(within(dialog).getByText('يبقى على المنظومة').parentElement).toHaveTextContent('0.00');

    fireEvent.change(within(dialog).getByLabelText('مبلغ السطر 2'), { target: { value: '3000' } });
    expect(within(dialog).getByText('تجاوز المبلغ بـ').parentElement).toHaveTextContent('1,000.00');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ المصروف' }));
    expect(toast.error).toHaveBeenCalledWith('مجموع التحميل أكبر من المبلغ');
    expect(svc.createCompanyExpense).not.toHaveBeenCalled();
  });

  it('requires the beneficiary of a salary', async () => {
    renderSection();
    await screen.findByText('راتب أكتوبر');
    fireEvent.click(screen.getByRole('button', { name: /مصروف منظومة/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('المبلغ'), { target: { value: '8000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ المصروف' }));
    expect(toast.error).toHaveBeenCalledWith('اختر المستفيد');
    expect(svc.createCompanyExpense).not.toHaveBeenCalled();
  });
});

describe('settling a balance', () => {
  it('prefills the repayment, says the account closes, and records the movement', async () => {
    renderSection();
    await screen.findByText('راتب أكتوبر');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /من له ومن عليه/ }));
    fireEvent.click(screen.getByRole('tab', { name: /من له ومن عليه/ }));
    const project = (await screen.findByText('مجمع المدار')).closest('.stat-card') as HTMLElement;
    fireEvent.click(within(project).getByRole('button', { name: 'تسجيل سداد' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('مبلغ الحركة')).toHaveValue(40000);
    expect(within(dialog).getByRole('status')).toHaveTextContent('يتساوى الحساب بين مجمع المدار والمنظومة.');
    fireEvent.change(within(dialog).getByLabelText('مبلغ الحركة'), { target: { value: '15000' } });
    expect(within(dialog).getByRole('status')).toHaveTextContent('بعد الحركة: مجمع المدار مدين لـالمنظومة بـ 25,000.00');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ الحركة' }));
    await waitFor(() => expect(svc.createEntry).toHaveBeenCalledTimes(1));
    expect(svc.createEntry.mock.calls[0][0]).toMatchObject({
      companyId: 'c1', amount: 15000, type: 'repayment', from: { kind: 'project', id: 'p2' }, to: { kind: 'company', id: null },
    });
    await waitFor(() => expect(svc.loadCompanyLedger).toHaveBeenCalledTimes(2));
  });
});
