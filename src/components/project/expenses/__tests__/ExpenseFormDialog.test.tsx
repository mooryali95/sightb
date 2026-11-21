/**
 * Component tests for the expense form on its own, written before it is
 * split. The section tests book against the active fund, strip VAT, refuse
 * an overflow on the fund, hold while the fund is only transferred, refuse
 * no source, activate the project and save an edit. What is pinned here is
 * the rest: the custody path with its breakdown and its overflow, the
 * budget item link with what it still holds, the VAT preview, the edit that
 * clears optional fields to null, and the read-only edit of the source.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import type { BudgetItem, Custody, Expense } from '@/types/project';
import { useStore, type AppState } from '@/store/useStore';
import { ExpenseFormDialog } from '../ExpenseFormDialog';
import { PROJECT_ID, FUND_ID, RESOURCE_ID, expense, expenses, fund, resource } from '../../__tests__/expenses-fixtures';

// The registry is empty here, so the name fields stay plain inputs.
vi.mock('@/hooks/useParties', () => ({ useParties: () => ({ data: [], isSuccess: true }) }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

const actions = {
  addExpense: vi.fn().mockResolvedValue('new-expense-id'),
  updateExpense: vi.fn().mockResolvedValue(undefined),
  acknowledgeFund: vi.fn().mockResolvedValue(undefined),
  updateProject: vi.fn().mockResolvedValue(undefined),
};
const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const custodies = fixture<Custody>([
  { id: 'c1', projectId: PROJECT_ID, resourceName: 'عمر', amount: 5000, status: 'active', sourceFundId: FUND_ID },
  { id: 'c-closed', projectId: PROJECT_ID, resourceName: 'مغلقة', amount: 9000, status: 'closed', sourceFundId: FUND_ID },
]);
const custodyExpense = expense({ id: 'exp-c', amount: 1000, fundId: undefined, custodyId: 'c1', description: 'من العهدة' });
const budgetItems = fixture<BudgetItem>([
  { id: 'b1', projectId: PROJECT_ID, category: 'consulting', description: 'استشارات', plannedAmount: 20000, costType: 'fixed', costClass: 'direct' },
  { id: 'b2', projectId: PROJECT_ID, category: 'salary', description: 'رواتب', plannedAmount: 30000, costType: 'recurring', costClass: 'direct' },
]);
const linked: Expense[] = [
  expense({ id: 'l1', amount: 7000, budgetItemId: 'b2' }),
  expense({ id: 'l2', amount: 3000, budgetItemId: 'b2', approvalStatus: 'rejected' }),
];

type Props = Partial<React.ComponentProps<typeof ExpenseFormDialog>>;
function renderForm(over: Props = {}, store: Partial<AppState> = {}) {
  useStore.setState({ projectFunds: [fund()], paymentRequests: [], cashTransfers: [], ...actions, ...store } satisfies Partial<AppState>);
  const onOpenChange = vi.fn();
  render(
    <ExpenseFormDialog
      open onOpenChange={onOpenChange} onRequestOpen={() => {}} projectId={PROJECT_ID} durationMonths={6}
      expenses={expenses} resources={[resource]} custodies={[]} budgetItems={[]} taxPercent={15} projectStatus="active" isAdmin
      {...over}
    />,
  );
  return { onOpenChange, dialog: screen.getByRole('dialog') };
}
function pick(dialog: HTMLElement, shown: string | RegExp, option: RegExp) {
  const trigger = within(dialog).getAllByText(shown).map((el) => el.closest('button')).find(Boolean) as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}
function fill(dialog: HTMLElement, amount: string, description = 'مصروف جديد') {
  fireEvent.change(within(dialog).getByPlaceholderText(/راتب شهر يناير/), { target: { value: description } });
  fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: amount } });
}
const submit = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: /^(إضافة|حفظ التعديلات)$/ }));

describe('ExpenseFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('books from a custody with its live remaining, refuses more than it holds, and never links the fund as well', async () => {
    const { dialog, onOpenChange } = renderForm({ custodies, expenses: [...expenses, custodyExpense] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'من العهدة' }));
    fireEvent.keyDown(within(dialog).getByText('اختر العهدة').closest('button') as HTMLElement, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['عمر — متبقي: 4,000.00 ر.س']);
    fireEvent.keyDown(screen.getByRole('option', { name: /عمر/ }), { key: 'Enter' });
    expect(within(dialog).getByText(/^المتبقي:/)).toHaveTextContent('4,000.00');
    fill(dialog, '4500');
    expect(within(dialog).getByText(/يتجاوز المتبقي \(4,000\.00/)).toBeInTheDocument();
    submit(dialog);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('يتجاوز المتبقي في العهدة'), expect.anything()));
    expect(actions.addExpense).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '4000' } });
    submit(dialog);
    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({ custodyId: 'c1', fundId: undefined, amount: 4000 })));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers only the budget items of the category, with what each still holds after the spend counted against it', () => {
    const { dialog } = renderForm({ budgetItems, expenses: [...expenses, ...linked] });
    const trigger = within(dialog).getByText('اختر بند الموازنة').closest('button') as HTMLElement;
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['بدون ربط', 'رواتب — متبقي: 23,000.00 ر.س']);
  });

  it('previews the VAT both ways, drops the inclusive switch for an exempt row, and books the net amount', async () => {
    const { dialog } = renderForm();
    fill(dialog, '1150');
    expect(within(dialog).getByText(/^شامل الضريبة:/)).toHaveTextContent('1,322.50');
    fireEvent.click(within(dialog).getByLabelText('المبلغ شامل الضريبة'));
    expect(within(dialog).getByText(/^بدون ضريبة:/)).toHaveTextContent('1,000.00');
    fireEvent.click(within(dialog).getByLabelText('معفى من الضريبة'));
    expect(within(dialog).queryByLabelText('المبلغ شامل الضريبة')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/الضريبة:/)).not.toBeInTheDocument();
    submit(dialog);
    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 1150, isVatExempt: true, fundId: FUND_ID })));
  });

  it('edits a row from its values, clears an optional link to null, and keeps the row off the source box', async () => {
    const row = expense({ id: 'e-edit', amount: 800, description: 'قديم', resourceId: RESOURCE_ID, vendor: 'شركة س', month: 3 });
    const { dialog } = renderForm({ editing: row, custodies });
    expect(within(dialog).getByText('تعديل المصروف')).toBeInTheDocument();
    expect(within(dialog).queryByText('مصدر الصرف')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton')).toHaveValue(800);
    expect(within(dialog).getByPlaceholderText(/راتب شهر يناير/)).toHaveValue('قديم');
    fireEvent.change(within(dialog).getByDisplayValue('شركة س'), { target: { value: '  ' } });
    submit(dialog);
    await waitFor(() => expect(actions.updateExpense).toHaveBeenCalledWith('e-edit', expect.objectContaining({
      amount: 800, month: 3, vendor: undefined, resourceId: RESOURCE_ID, custodyId: null, budgetItemId: null, fundId: FUND_ID,
    })));
    expect(toast.success).toHaveBeenCalledWith('تم تعديل المصروف');
  });

  it('reports a refused save in the user\'s words and stays open', async () => {
    actions.addExpense.mockRejectedValueOnce(new Error('المصروف يتجاوز الرصيد المتبقي للدفعة #1'));
    const { dialog, onOpenChange } = renderForm();
    fill(dialog, '100');
    submit(dialog);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('المصروف يتجاوز الرصيد المتبقي للدفعة #1'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  describe('an invoice in another currency', () => {
    const turnOn = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByLabelText('الفاتورة بعملة أخرى'));
    const field = (dialog: HTMLElement, label: string) => within(dialog).getByLabelText(label);
    const booked = (dialog: HTMLElement) => within(dialog).getAllByRole('spinbutton')[0];

    it('books invoice amount × rate, and saves what the invoice said beside the amount', async () => {
      const { dialog } = renderForm();
      fill(dialog, '1');
      turnOn(dialog);
      pick(dialog, 'اختر العملة', /USD/);
      fireEvent.change(field(dialog, 'مبلغ الفاتورة بعملتها'), { target: { value: '1000' } });
      fireEvent.change(field(dialog, 'سعر الصرف'), { target: { value: '3.75' } });
      expect(booked(dialog)).toHaveValue(3750);
      submit(dialog);
      await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({
        originalAmount: 1000, originalCurrency: 'USD', exchangeRate: 3.75,
      })));
    });

    it('works the rate out from what was actually booked', () => {
      const { dialog } = renderForm();
      turnOn(dialog);
      fireEvent.change(field(dialog, 'مبلغ الفاتورة بعملتها'), { target: { value: '1000' } });
      fireEvent.change(booked(dialog), { target: { value: '3765.5' } });
      expect(field(dialog, 'سعر الصرف')).toHaveValue(3.7655);
    });

    it('refuses a half-filled invoice in plain words, and sends nothing foreign when the option is off', async () => {
      const { dialog } = renderForm();
      fill(dialog, '100');
      turnOn(dialog);
      submit(dialog);
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/عملة الفاتورة/));
      expect(actions.addExpense).not.toHaveBeenCalled();
      turnOn(dialog); // off again
      submit(dialog);
      await waitFor(() => expect(actions.addExpense).toHaveBeenCalled());
      expect(actions.addExpense.mock.calls[0][0]).not.toHaveProperty('originalCurrency');
    });

    it('opens a foreign row with its values, and removing the option clears them', async () => {
      const row = expense({ id: 'e-fx', amount: 375, description: 'قطع غيار', originalAmount: 100, originalCurrency: 'USD', exchangeRate: 3.75 });
      const { dialog } = renderForm({ editing: row });
      expect(field(dialog, 'مبلغ الفاتورة بعملتها')).toHaveValue(100);
      expect(field(dialog, 'سعر الصرف')).toHaveValue(3.75);
      turnOn(dialog); // off
      submit(dialog);
      await waitFor(() => expect(actions.updateExpense).toHaveBeenCalledWith('e-fx', expect.objectContaining({ foreign: null })));
    });

    it('leaves a row that never had one untouched on edit', async () => {
      const { dialog } = renderForm({ editing: expense({ id: 'e-plain', amount: 50, description: 'عادي' }) });
      submit(dialog);
      await waitFor(() => expect(actions.updateExpense).toHaveBeenCalled());
      expect(actions.updateExpense.mock.calls[0][1]).not.toHaveProperty('foreign');
    });

    it('says the feature is not live yet when the database lacks the columns', async () => {
      actions.addExpense.mockRejectedValueOnce(new Error("Could not find the 'exchange_rate' column of 'expenses' in the schema cache"));
      const { dialog, onOpenChange } = renderForm();
      fill(dialog, '1');
      turnOn(dialog);
      pick(dialog, 'اختر العملة', /EUR/);
      fireEvent.change(field(dialog, 'مبلغ الفاتورة بعملتها'), { target: { value: '10' } });
      fireEvent.change(field(dialog, 'سعر الصرف'), { target: { value: '4' } });
      submit(dialog);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/لم تُفعَّل في قاعدة البيانات/), expect.anything()));
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
