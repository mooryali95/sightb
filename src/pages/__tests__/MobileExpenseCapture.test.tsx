/**
 * Component tests for the mobile expense capture page, written before it
 * is split.
 *
 * What it writes is what costs money: the amount (net of the project's
 * VAT), the month (the project's month, which the whole finance library
 * buckets by), the fund it draws on and the receipt it attaches. The two
 * services behind it (OCR and the receipt upload) are mocked whole.
 *
 * Three tests were red when written. VAT was stripped at a hard-coded 15%
 * whatever the project's rate; the month was the calendar month of the
 * date rather than the project's month, so a May receipt on a project
 * that started in March landed in month 5 and, past the project's
 * duration, fell out of every monthly figure; and nothing refused an
 * amount larger than the fund still held, which the desktop form does.
 * The fix commit that follows turns them green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import { extractReceiptData } from '@/services/aiService';
import { uploadReceipt, attachReceiptMetadata } from '@/services/expenseAttachmentService';
import MobileExpenseCapture from '../MobileExpenseCapture';
import { FUND_ID, NO_FUND_PROJECT_ID, PROJECT_ID, expenses, fund, projects } from './mobile-capture-fixtures';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'me@example.com' }, session: null, loading: false, signOut: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/services/aiService', () => ({ extractReceiptData: vi.fn() }));
vi.mock('@/services/expenseAttachmentService', () => ({
  uploadReceipt: vi.fn(),
  attachReceiptMetadata: vi.fn().mockResolvedValue(undefined),
}));

const actions = {
  addExpense: vi.fn().mockResolvedValue('new-expense-id'),
};

function seedStore(over: Partial<AppState> = {}) {
  useStore.setState({
    projects, expenses, projectFunds: [fund], custodies: [], paymentRequests: [], cashTransfers: [],
    ...actions,
    ...over,
  } satisfies Partial<AppState>);
}

function renderPage(query = `?project=${PROJECT_ID}`) {
  return render(
    <MemoryRouter initialEntries={[`/m/expense/new${query}`]}>
      <Routes>
        <Route path="/m/expense/new" element={<MobileExpenseCapture />} />
        <Route path="/project/:id" element={<p>صفحة المشروع</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Reaches the form without a picture. */
function openFormByHand() {
  fireEvent.click(screen.getByRole('button', { name: /إدخال يدوي بدون صورة/ }));
}

function fill(description: string, amount: string, date = '2026-05-10') {
  fireEvent.change(screen.getByPlaceholderText(/قرطاسية للمكتب/), { target: { value: description } });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: amount } });
  fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: date } });
}

function saveAndClose() {
  fireEvent.click(screen.getByRole('button', { name: /حفظ وإغلاق/ }));
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(shown: string | RegExp, option: RegExp) {
  const trigger = screen.getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

/** A picture, as the file input would hand it over. */
function chooseImage(): File {
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'receipt.png', { type: 'image/png' });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.warning).mockClear();
  vi.mocked(extractReceiptData).mockReset();
  vi.mocked(uploadReceipt).mockReset().mockResolvedValue({ path: 'me/1.png', name: 'إيصال بدون مورد' });
  vi.mocked(attachReceiptMetadata).mockClear();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  seedStore();
});

describe('reaching the form', () => {
  it('opens on the capture step and reaches the form by hand, on the project from the link', () => {
    renderPage();
    expect(screen.getByText('صوّر الفاتورة')).toBeInTheDocument();
    openFormByHand();
    expect(screen.getByText('مشروع الوزارة')).toBeInTheDocument();
    expect(screen.getByText(/الدفعة #1 — متبقي: 500 ر\.س/)).toBeInTheDocument();
  });

  it('offers only projects that are not archived or cancelled', () => {
    renderPage();
    openFormByHand();
    fireEvent.keyDown(screen.getByText('مشروع الوزارة').closest('button') as HTMLElement, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'مشروع بلا دفعة' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'مشروع مؤرشف' })).not.toBeInTheDocument();
  });
});

describe('what gets saved', () => {
  it('refuses a save without a description, and one without a positive amount', async () => {
    renderPage();
    openFormByHand();
    saveAndClose();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('أدخل وصفاً'));

    fill('قرطاسية', '0');
    saveAndClose();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('أدخل مبلغاً صحيحاً'));
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('saves a pending expense in the project\'s month against the active fund, then goes to the project', async () => {
    renderPage();
    openFormByHand();
    // 10 May on a project that started 1 March is its third month.
    fill('قرطاسية', '400', '2026-05-10');
    saveAndClose();

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledTimes(1));
    expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID, description: 'قرطاسية', amount: 400, date: '2026-05-10', month: 3,
      approvalStatus: 'pending', fundId: FUND_ID, responsible: 'me@example.com', isVatExempt: false,
    }));
    await waitFor(() => expect(screen.getByText('صفحة المشروع')).toBeInTheDocument());
    expect(uploadReceipt).not.toHaveBeenCalled();
    expect(attachReceiptMetadata).not.toHaveBeenCalled();
  });

  it('strips VAT at the project\'s own rate when the total includes it', async () => {
    renderPage();
    openFormByHand();
    // This project carries 5%: 420 inclusive is 400 net. At 15% it would be 365.22.
    fill('قرطاسية', '420');
    fireEvent.click(screen.getByLabelText(/المبلغ شامل ضريبة القيمة المضافة/));
    saveAndClose();

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 400 })));
  });

  it('keeps the amount whole when the expense is VAT-exempt', async () => {
    renderPage();
    openFormByHand();
    fill('قرطاسية', '400');
    fireEvent.click(screen.getByLabelText(/المبلغ شامل ضريبة القيمة المضافة/));
    fireEvent.click(screen.getByLabelText(/معفى من الضريبة/));
    saveAndClose();

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 400, isVatExempt: true })));
  });

  it('refuses more than the active fund still holds', async () => {
    renderPage();
    openFormByHand();
    // 3,000 − 2,500 spent = 500 left; 600 does not fit.
    fill('قرطاسية', '600');
    saveAndClose();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/يتجاوز المتبقي في الدفعة #1/)));
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('warns when the project has no active fund and saves without one', async () => {
    renderPage();
    openFormByHand();
    pick('مشروع الوزارة', /مشروع بلا دفعة/);
    expect(screen.getByText(/لا توجد دفعة نشطة/)).toBeInTheDocument();
    fill('قرطاسية', '100');
    saveAndClose();

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({ projectId: NO_FUND_PROJECT_ID, fundId: undefined })));
  });

  it('"حفظ + التالي" returns to the capture step and keeps the project', async () => {
    renderPage();
    openFormByHand();
    fill('قرطاسية', '100');
    fireEvent.click(screen.getByRole('button', { name: /حفظ \+ التالي/ }));

    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('صوّر الفاتورة')).toBeInTheDocument());
    openFormByHand();
    expect(screen.getByText('مشروع الوزارة')).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/قرطاسية للمكتب/) as HTMLInputElement).value).toBe('');
  });
});

describe('the picture', () => {
  it('uploads the receipt and attaches it to the saved expense', async () => {
    renderPage();
    const file = chooseImage();
    fireEvent.click(screen.getByRole('button', { name: /تخطي والإدخال يدوياً/ }));
    fill('قرطاسية', '100');
    saveAndClose();

    await waitFor(() => expect(uploadReceipt).toHaveBeenCalledWith('me', file, 'إيصال بدون مورد'));
    await waitFor(() => expect(attachReceiptMetadata).toHaveBeenCalledWith('new-expense-id', { path: 'me/1.png', name: 'إيصال بدون مورد' }, null));
  });

  it('prefills the form from what the OCR read, and stores that reading with the expense', async () => {
    const reading = {
      vendor_name: 'مكتبة الجامعة', invoice_number: 'A-17', invoice_date: '2026-04-02', total_amount: 420,
      is_vat_inclusive: true, suggested_category: 'printing', description: 'قرطاسية وأحبار', confidence: 0.9,
    };
    vi.mocked(extractReceiptData).mockResolvedValue(reading);
    renderPage();
    chooseImage();
    fireEvent.click(screen.getByRole('button', { name: /استخراج بالذكاء/ }));

    await waitFor(() => expect(screen.getByText(/تم الاستخراج بدقة 90%/)).toBeInTheDocument());
    expect((screen.getByPlaceholderText(/قرطاسية للمكتب/) as HTMLInputElement).value).toBe('قرطاسية وأحبار');
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('420');
    expect((screen.getByLabelText(/المبلغ شامل ضريبة القيمة المضافة/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('طباعة ونسخ')).toBeInTheDocument();

    saveAndClose();
    await waitFor(() => expect(actions.addExpense).toHaveBeenCalledWith(expect.objectContaining({
      amount: 400, vendor: 'مكتبة الجامعة', invoiceRef: 'A-17', date: '2026-04-02', category: 'printing',
    })));
    await waitFor(() => expect(attachReceiptMetadata).toHaveBeenCalledWith('new-expense-id', expect.objectContaining({ path: 'me/1.png' }), reading));
  });

  it('falls back to entering by hand when the OCR fails', async () => {
    vi.mocked(extractReceiptData).mockRejectedValue(new Error('الخدمة غير متاحة'));
    renderPage();
    chooseImage();
    fireEvent.click(screen.getByRole('button', { name: /استخراج بالذكاء/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('الخدمة غير متاحة'));
    expect(screen.getByPlaceholderText(/قرطاسية للمكتب/)).toBeInTheDocument();
    expect(screen.queryByText(/تم الاستخراج بدقة/)).not.toBeInTheDocument();
  });
});
