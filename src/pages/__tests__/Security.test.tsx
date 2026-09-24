/**
 * The security page: lists the account's passkeys with their kind and
 * dates, registers a new one under a typed name, refuses a blank name
 * before touching the authenticator, and deletes after a confirmation. When
 * the session has no confirmed code it has one emailed, takes it, and only
 * then lets the key be registered, by a fresh press.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import Security from '../Security';

const m = vi.hoisted(() => ({
  list: vi.fn(), register: vi.fn(), del: vi.fn(), supported: vi.fn(() => true), sendCode: vi.fn(), confirm: vi.fn(),
}));
vi.mock('@/services/passkeyService', async (orig) => ({
  ...(await orig<typeof import('@/services/passkeyService')>()),
  listPasskeys: m.list, registerPasskey: m.register, deletePasskey: m.del, passkeysSupported: m.supported,
  sendStepUpCode: m.sendCode, confirmStepUp: m.confirm,
}));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const phone = { id: 'pk-1', name: 'هاتفي', createdAt: '2026-09-01T00:00:00Z', lastUsedAt: '2026-09-18T00:00:00Z', deviceType: 'multiDevice', backedUp: true, transports: ['internal'], canSignIn: true, discoverable: true };
const key = { id: 'pk-2', name: 'مفتاح المكتب', createdAt: '2026-09-02T00:00:00Z', lastUsedAt: null, deviceType: 'singleDevice', backedUp: false, transports: ['usb'], canSignIn: false, discoverable: null };

describe('Security', () => {
  beforeEach(() => { vi.clearAllMocks(); m.supported.mockReturnValue(true); m.list.mockResolvedValue([phone, key]); });

  it('lists each passkey with its kind and whether it was used', async () => {
    render(<Security />);
    expect(await screen.findByText('هاتفي')).toBeInTheDocument();
    expect(screen.getByText(/مفتاح مزامَن عبر أجهزتك/)).toBeInTheDocument();
    expect(screen.getByText(/مفتاح على هذا الجهاز فقط/)).toBeInTheDocument();
    expect(screen.getByText(/لم يُستخدم بعد/)).toBeInTheDocument();
  });

  it('says which keys sign in on their own and how to make an older one do so', async () => {
    render(<Security />);
    await screen.findByText('هاتفي');
    expect(screen.getAllByText('يصلح للدخول دون كلمة مرور')).toHaveLength(1);
    expect(screen.getAllByText('للتحقق فقط. أضف مفتاحاً جديداً من الجهاز نفسه لتدخل به دون كلمة مرور، ثم احذف هذا.')).toHaveLength(1);
  });

  it('advises nothing for a key that can never sign in, and says nothing while the server cannot tell', async () => {
    m.list.mockResolvedValue([
      { ...key, id: 'pk-5', name: 'مفتاح USB', canSignIn: false, discoverable: false },
      { ...phone, id: 'pk-6', name: 'غير معروف', canSignIn: null, discoverable: null },
    ]);
    render(<Security />);
    await screen.findByText('مفتاح USB');
    expect(screen.getByText('للتحقق فقط: هذا المفتاح لا يحفظ الحساب ليدخل به وحده.')).toBeInTheDocument();
    expect(screen.queryByText(/أضف مفتاحاً جديداً/)).not.toBeInTheDocument();
    expect(screen.queryByText('يصلح للدخول دون كلمة مرور')).not.toBeInTheDocument();
  });

  it('shows the empty state, and disables adding where the browser cannot', async () => {
    m.list.mockResolvedValue([]);
    m.supported.mockReturnValue(false);
    render(<Security />);
    expect(await screen.findByText(/لا توجد مفاتيح مرور مسجّلة/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إضافة مفتاح مرور/ })).toBeDisabled();
    expect(screen.getByText(/هذا المتصفح لا يدعم مفاتيح المرور/)).toBeInTheDocument();
  });

  it('registers under the typed name and adds it to the list, refusing a blank name first', async () => {
    m.list.mockResolvedValue([]);
    m.register.mockResolvedValue({ ...key, id: 'pk-3', name: 'جهاز العمل' });
    render(<Security />);
    await screen.findByText(/لا توجد مفاتيح مرور مسجّلة/);
    fireEvent.click(screen.getByRole('button', { name: /إضافة مفتاح مرور/ }));
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل المفتاح' }));
    expect(toast.error).toHaveBeenCalledWith('اكتب اسماً يميّز هذا المفتاح');
    expect(m.register).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('اسم المفتاح'), { target: { value: '  جهاز العمل ' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل المفتاح' }));
    await waitFor(() => expect(m.register).toHaveBeenCalledWith('جهاز العمل'));
    expect(await screen.findByText('جهاز العمل')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('تم تسجيل "جهاز العمل"');
  });

  it('surfaces a cancelled ceremony as its message and keeps the dialog', async () => {
    m.list.mockResolvedValue([]);
    m.register.mockRejectedValue(Object.assign(new Error('cancel'), { name: 'NotAllowedError' }));
    render(<Security />);
    await screen.findByText(/لا توجد مفاتيح مرور مسجّلة/);
    fireEvent.click(screen.getByRole('button', { name: /إضافة مفتاح مرور/ }));
    fireEvent.change(screen.getByLabelText('اسم المفتاح'), { target: { value: 'هاتفي' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل المفتاح' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('أُلغي التحقق أو انتهت مهلته. حاول مرة أخرى.'));
    expect(screen.getByLabelText('اسم المفتاح')).toBeInTheDocument();
  });

  it('deletes only after confirmation and drops the row', async () => {
    m.del.mockResolvedValue(undefined);
    render(<Security />);
    await screen.findByText('هاتفي');
    const row = screen.getByText('هاتفي').closest('li') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLButtonElement);
    expect(await screen.findByText('حذف مفتاح المرور')).toBeInTheDocument();
    expect(m.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('pk-1'));
    await waitFor(() => expect(screen.queryByText('هاتفي')).not.toBeInTheDocument());
    expect(screen.getByText('مفتاح المكتب')).toBeInTheDocument();
  });

  it('confirms an emailed code before registering when the session has none', async () => {
    const { StepUpRequired } = await vi.importActual<typeof import('@/services/passkeyService')>('@/services/passkeyService');
    m.list.mockResolvedValue([]);
    m.register.mockRejectedValueOnce(new StepUpRequired()).mockResolvedValueOnce({ ...phone, id: 'pk-9', name: 'جهاز العمل' });
    m.sendCode.mockResolvedValue(undefined);
    m.confirm.mockRejectedValueOnce(new Error('الرمز غير صحيح أو انتهت صلاحيته')).mockResolvedValueOnce(undefined);
    render(<Security />);
    await screen.findByText(/لا توجد مفاتيح مرور مسجّلة/);
    fireEvent.click(screen.getByRole('button', { name: /إضافة مفتاح مرور/ }));
    fireEvent.change(screen.getByLabelText('اسم المفتاح'), { target: { value: 'جهاز العمل' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل المفتاح' }));

    const codeInput = await screen.findByLabelText('رمز التأكيد');
    expect(m.sendCode).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('أرسلنا رمز تأكيد إلى بريدك');

    fireEvent.change(codeInput, { target: { value: '12ab3' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }));
    expect(toast.error).toHaveBeenCalledWith('اكتب الرمز المكوّن من ستة أرقام');
    expect(m.confirm).not.toHaveBeenCalled();

    fireEvent.change(codeInput, { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('الرمز غير صحيح أو انتهت صلاحيته'));
    expect(screen.getByLabelText('رمز التأكيد')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('رمز التأكيد'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }));
    await waitFor(() => expect(m.confirm).toHaveBeenLastCalledWith('123456'));
    // Registration waits for a fresh press, never runs inside the confirmation.
    expect(m.register).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل المفتاح' }));
    expect(await screen.findByText('جهاز العمل')).toBeInTheDocument();
    expect(m.register).toHaveBeenCalledTimes(2);
  });

  it('never mails a second code by itself when the server still asks right after a confirmation', async () => {
    const { StepUpRequired } = await vi.importActual<typeof import('@/services/passkeyService')>('@/services/passkeyService');
    m.list.mockResolvedValue([]);
    m.register.mockRejectedValue(new StepUpRequired());
    m.sendCode.mockResolvedValue(undefined);
    m.confirm.mockResolvedValue(undefined);
    render(<Security />);
    await screen.findByText(/لا توجد مفاتيح مرور مسجّلة/);
    fireEvent.click(screen.getByRole('button', { name: /إضافة مفتاح مرور/ }));
    fireEvent.change(screen.getByLabelText('اسم المفتاح'), { target: { value: 'هاتفي' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل المفتاح' }));
    fireEvent.change(await screen.findByLabelText('رمز التأكيد'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }));
    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل المفتاح' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('انتهت صلاحية التأكيد. أغلق النافذة وابدأ من جديد.'));
    expect(m.sendCode).toHaveBeenCalledTimes(1);
  });
});
