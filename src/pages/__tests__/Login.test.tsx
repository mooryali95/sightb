/**
 * Component tests for the login page, written before it is split. This is
 * the door. What must hold: bad input never reaches the server; a refused
 * password stays on the page; a plain sign-in accepts any pending invite
 * and goes home; a user without roles is signed straight out; an admin on
 * an unknown device is held at the one-time code, which is verified with
 * the device's fingerprint and can be cancelled; and the reset link goes
 * to the reset page.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import Login from '../Login';

const m = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { signInWithPassword: m.signInWithPassword, getSession: m.getSession, signOut: m.signOut, resetPasswordForEmail: m.resetPasswordForEmail },
    functions: { invoke: m.invoke },
  },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/assets/basserh-logo.jpg', () => ({ default: 'logo.jpg' }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
document.elementFromPoint = () => null;

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}
function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}
const submitLogin = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: password } });
  fireEvent.submit(screen.getByLabelText('كلمة المرور').closest('form') as HTMLFormElement);
};
/** The one-time-code check the edge function answers with. */
const otpCheck = (data: Record<string, unknown>) => m.invoke.mockImplementation(async (name: string) =>
  name === 'admin-otp' ? { data, error: null } : { data: {}, error: null });

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    m.signInWithPassword.mockResolvedValue({ error: null });
    m.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    m.invoke.mockResolvedValue({ data: {}, error: null });
  });

  it('refuses a bad email or a short password before reaching the server', () => {
    renderLogin();
    submitLogin('not-an-email', 'secret1');
    expect(toast.error).toHaveBeenCalledWith('البريد الإلكتروني غير صالح');
    submitLogin('pm@example.com', '123');
    expect(toast.error).toHaveBeenCalledWith('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    expect(m.signInWithPassword).not.toHaveBeenCalled();
  });

  it('stays on the page with a message when the password is refused', async () => {
    m.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    renderLogin();
    submitLogin(' pm@example.com ', 'secret1');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('بيانات الدخول غير صحيحة'));
    expect(m.signInWithPassword).toHaveBeenCalledWith({ email: 'pm@example.com', password: 'secret1' });
    expect(m.invoke).not.toHaveBeenCalled();
    expect(screen.getByText('تسجيل الدخول', { selector: 'h2' })).toBeInTheDocument();
  });

  it('checks the device with a fingerprint it keeps, accepts any pending invite, and goes home when no code is needed', async () => {
    otpCheck({ requiresOtp: false });
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    await screen.findByTestId('path');
    expect(screen.getByTestId('path')).toHaveTextContent('/');
    const fingerprint = localStorage.getItem('rouya_device_fp');
    expect(fingerprint).toMatch(/[0-9a-f-]{36}/);
    expect(m.invoke).toHaveBeenNthCalledWith(1, 'admin-otp', { body: { action: 'check', fingerprint } });
    expect(m.invoke).toHaveBeenNthCalledWith(2, 'accept-invite', { body: {} });
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it('signs a user without roles straight out, and one the check rate-limited', async () => {
    otpCheck({ noRoles: true });
    const { unmount } = renderLogin();
    submitLogin('pm@example.com', 'secret1');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('ليس لديك صلاحية للوصول. تواصل مع مدير النظام.'));
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('path')).not.toBeInTheDocument();
    unmount();

    otpCheck({ rateLimited: true, error: 'كثير من المحاولات' });
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('كثير من المحاولات'));
    expect(m.signOut).toHaveBeenCalledTimes(2);
    expect(m.invoke).not.toHaveBeenCalledWith('accept-invite', expect.anything());
  });

  it('holds an admin on an unknown device at the code, rejects a wrong one, verifies the right one with the fingerprint, and goes home', async () => {
    otpCheck({ requiresOtp: true, sent: true });
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('تم إرسال رمز التحقق إلى بريدك الإلكتروني');
    const resend = screen.getByText(/إعادة الإرسال \(60ث\)/).closest('button') as HTMLButtonElement;
    expect(resend).toBeDisabled();
    const confirm = screen.getByText('تأكيد الرمز').closest('button') as HTMLButtonElement;
    expect(confirm).toBeDisabled();
    const fingerprint = localStorage.getItem('rouya_device_fp');

    const code = document.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement;
    m.invoke.mockResolvedValueOnce({ data: { verified: false, error: 'الرمز غير صحيح' }, error: null });
    fireEvent.change(code, { target: { value: '111111' } });
    expect(confirm).toBeEnabled();
    fireEvent.submit(confirm.closest('form') as HTMLFormElement);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('الرمز غير صحيح'));
    expect(m.invoke).toHaveBeenLastCalledWith('admin-otp', { body: { action: 'verify', code: '111111', fingerprint } });
    expect(code).toHaveValue('');
    expect(screen.queryByTestId('path')).not.toBeInTheDocument();

    m.invoke.mockResolvedValueOnce({ data: { verified: true }, error: null });
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.submit(confirm.closest('form') as HTMLFormElement);
    await screen.findByTestId('path');
    expect(m.invoke).toHaveBeenLastCalledWith('accept-invite', { body: {} });
    expect(toast.success).toHaveBeenCalledWith('تم التحقق بنجاح');
  });

  it('cancelling the code signs out and returns to the password form', async () => {
    otpCheck({ requiresOtp: true, sent: false });
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith('لم يتم إرسال الرمز. حاول "إعادة إرسال الرمز" أو تواصل مع المدير.');
    fireEvent.click(screen.getByText('إلغاء'));
    await waitFor(() => expect(screen.getByText('تسجيل الدخول', { selector: 'h2' })).toBeInTheDocument());
    expect(m.signOut).toHaveBeenCalledTimes(1);
  });

  it('sends the reset link for the typed email to the reset page and returns to the form', async () => {
    m.resetPasswordForEmail.mockResolvedValue({ error: null });
    renderLogin();
    fireEvent.click(screen.getByText('نسيت كلمة المرور؟'));
    expect(await screen.findByText('استعادة كلمة المرور')).toBeInTheDocument();
    const email = screen.getByLabelText('البريد الإلكتروني');
    fireEvent.submit(email.closest('form') as HTMLFormElement);
    expect(toast.error).toHaveBeenCalledWith('يرجى إدخال البريد الإلكتروني');
    fireEvent.change(email, { target: { value: ' pm@example.com ' } });
    fireEvent.submit(email.closest('form') as HTMLFormElement);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني'));
    expect(m.resetPasswordForEmail).toHaveBeenCalledWith('pm@example.com', { redirectTo: `${window.location.origin}/reset-password` });
    await waitFor(() => expect(screen.getByText('تسجيل الدخول', { selector: 'h2' })).toBeInTheDocument());
  });
});
