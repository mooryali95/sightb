/**
 * Component tests for the fund settlement dialog on its own, written before
 * it is split. The section tests reconcile the figures, autofill the cash,
 * send, insist on a reason, save the draft and open read-only. What is
 * pinned here is the rest: the breakdown and the note on what keeps the
 * remaining from closing at zero, the attachments and their submission,
 * the refusal to send a fund with a double-linked row, the draft without a
 * settlement on file, and the rejected and approved views.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import type { CashTransfer, Custody, FundSettlement, PaymentRequest } from '@/types/project';
import { useStore, type AppState } from '@/store/useStore';
import { FundSettlementDialog } from '../FundSettlementDialog';
import { FUND_ID, PROJECT_ID, expense, expenses, fund, settlement } from '../../__tests__/funds-fixtures';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

const actions = { submitSettlement: vi.fn(async () => {}), updateSettlementDraft: vi.fn(async () => {}) };
const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const custodies = fixture<Custody>([{ id: 'c1', projectId: PROJECT_ID, resourceName: 'عمر', amount: 5000, status: 'active', sourceFundId: FUND_ID }]);
const custodyExpense = expense({ id: 'exp-c', amount: 1000, fundId: undefined, custodyId: 'c1', description: 'من العهدة' });
const advances = fixture<PaymentRequest>([{
  id: 'pr1', projectId: PROJECT_ID, description: 'سلفة أحمد', amount: 2000, refundedAmount: 500,
  requestType: 'advance', status: 'paid', paidFromFundId: FUND_ID, isAdvanceOutstanding: true,
}]);
const transfers = fixture<CashTransfer>([{ id: 't1', projectId: PROJECT_ID, fromFundId: FUND_ID, toCustodyId: 'c1', amount: 3000, transferDate: '2026-02-05' }]);

type Props = Partial<React.ComponentProps<typeof FundSettlementDialog>>;
function renderDialog(over: Props = {}) {
  useStore.setState(actions satisfies Partial<AppState>);
  const onClose = vi.fn();
  const { unmount } = render(
    <FundSettlementDialog
      fund={fund()} existing={undefined} projectExpenses={expenses} projectCustodies={[]} projPRs={[]} projTransfers={[]}
      readOnly={false} onClose={onClose} {...over}
    />,
  );
  return { onClose, unmount, dialog: screen.getByRole('dialog') };
}
const figure = (dialog: HTMLElement, label: string) => within(dialog).getByText(label).nextElementSibling?.textContent;

describe('FundSettlementDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('breaks the documented spend down and explains what keeps the remaining from closing at zero', () => {
    const { dialog } = renderDialog({ projectCustodies: custodies, projectExpenses: [...expenses, custodyExpense], projPRs: advances, projTransfers: transfers });
    expect(within(dialog).getByText(/مصروف مباشر:/)).toHaveTextContent('12,000.00');
    expect(within(dialog).getByText(/عهد مسحوبة:/)).toHaveTextContent('5,000.00');
    expect(within(dialog).getByText(/سلف قائمة:/)).toHaveTextContent('1,500.00');
    expect(within(dialog).getByText(/تحويلات نقدية:/)).toHaveTextContent('3,000.00');
    expect(within(dialog).getByText('بنود غير مسوّاة تمنع إقفال المتبقي عند 0:')).toBeInTheDocument();
    expect(within(dialog).getByText(/^عمر — متبقي فيها:/)).toHaveTextContent('7,000.00');
    expect(within(dialog).getByText(/^سلفة أحمد —/)).toHaveTextContent('1,500.00');
    expect(within(dialog).queryByText(/كل مكونات الدفعة موثّقة/)).not.toBeInTheDocument();
  });

  it('declares the fund fully documented when nothing is open', () => {
    const { dialog } = renderDialog();
    expect(within(dialog).getByText(/كل مكونات الدفعة موثّقة/)).toBeInTheDocument();
    expect(figure(dialog, 'الفرق')).toBe('38,000.00 ر.س');
  });

  it('adds and removes attachments, ignores one without a name, and sends them with the settlement', async () => {
    const { dialog, onClose } = renderDialog();
    const name = within(dialog).getByPlaceholderText('اسم المرفق');
    const url = within(dialog).getByPlaceholderText('رابط (اختياري)');
    const add = within(dialog).getByRole('button', { name: 'إضافة' });
    fireEvent.change(url, { target: { value: 'https://x/1.pdf' } });
    fireEvent.click(add);
    expect(within(dialog).queryByText('فتح')).not.toBeInTheDocument();

    fireEvent.change(name, { target: { value: ' فاتورة حديد ' } });
    fireEvent.click(add);
    expect(within(dialog).getByText('فاتورة حديد')).toBeInTheDocument();
    expect(within(dialog).getByText('فتح')).toHaveAttribute('href', 'https://x/1.pdf');
    expect(name).toHaveValue('');
    expect(url).toHaveValue('');

    fireEvent.change(name, { target: { value: 'إيصال' } });
    fireEvent.click(add);
    const rows = within(dialog).getAllByText(/فاتورة حديد|إيصال/).map((s) => s.closest('.border') as HTMLElement);
    fireEvent.click(within(rows[0]).getByRole('button'));
    expect(within(dialog).queryByText('فاتورة حديد')).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '38000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إرسال للاعتماد' }));
    await waitFor(() => expect(actions.submitSettlement).toHaveBeenCalledWith(FUND_ID, 38000, [expect.objectContaining({ name: 'إيصال', url: undefined })], undefined));
    expect(toast.success).toHaveBeenCalledWith('تم إرسال التسوية للاعتماد');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('will not send a fund with a row linked to a custody as well, and names the row', async () => {
    const double = expense({ id: 'exp-x', amount: 700, custodyId: 'c1', description: 'مزدوج' });
    const { dialog } = renderDialog({ projectExpenses: [...expenses, double] });
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '37300' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إرسال للاعتماد' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('1 بند مربوط بعهدة ودفعة معاً'), expect.anything()));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain('• مزدوج (700.00');
    expect(actions.submitSettlement).not.toHaveBeenCalled();
  });

  it('refuses to save a draft before a settlement exists, and reports a refused send', async () => {
    actions.submitSettlement.mockRejectedValueOnce(new Error('الدفعة مقفلة'));
    const { dialog, onClose } = renderDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ مسودة' }));
    expect(toast.error).toHaveBeenCalledWith('لا توجد مسودة لحفظها — اضغط "إرسال للاعتماد" لإنشاء التسوية أولاً.');
    expect(actions.updateSettlementDraft).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '38000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إرسال للاعتماد' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('الدفعة مقفلة'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens a rejected settlement on its values and its reason, still editable, and an approved one read-only with its date', () => {
    const rejected: FundSettlement = settlement({ status: 'rejected', remainingCash: 37000, differenceReason: 'نقد بلا فاتورة', rejectionReason: 'الفواتير ناقصة', attachments: [{ name: 'قديم' }] });
    const first = renderDialog({ existing: rejected });
    expect(within(first.dialog).getByRole('spinbutton')).toHaveValue(37000);
    expect(within(first.dialog).getByPlaceholderText(/مصروف نقدي بدون فاتورة/)).toHaveValue('نقد بلا فاتورة');
    expect(within(first.dialog).getByText('قديم')).toBeInTheDocument();
    expect(within(first.dialog).getByText('سبب الرفض:').parentElement).toHaveTextContent('الفواتير ناقصة');
    expect(within(first.dialog).getByRole('button', { name: 'إرسال للاعتماد' })).toBeInTheDocument();
    expect(within(first.dialog).getByRole('button', { name: 'احتسب تلقائياً' })).toBeInTheDocument();
    first.unmount();

    const { dialog } = renderDialog({ existing: settlement({ status: 'approved', remainingCash: 38000, approvalDate: '2026-03-01T09:00:00Z' }) });
    expect(within(dialog).getByText('✓ مُعتمدة في 2026-03-01')).toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'احتسب تلقائياً' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'إرسال للاعتماد' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'حفظ مسودة' })).not.toBeInTheDocument();
  });

  it('withholds the writes from a read-only viewer while still showing the figures', () => {
    const { dialog } = renderDialog({ readOnly: true, existing: settlement() });
    expect(figure(dialog, 'المستلم')).toBe('50,000.00 ر.س');
    expect(within(dialog).queryByRole('button', { name: 'إرسال للاعتماد' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'حفظ مسودة' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'إغلاق' })).toBeInTheDocument();
  });
});
