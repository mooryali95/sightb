/**
 * Component tests for the login page, written before it is split. This is
 * the door. What must hold: bad input never reaches the server; a refused
 * password stays on the page; a plain sign-in accepts any pending invite
 * and goes home; a user without roles is signed straight out; an admin on
 * an unknown device is held at the one-time code, which is verified with
 * the device's fingerprint and can be cancelled; a passkey alone opens a
 * session with no email or password typed; and the reset link goes to the
 * reset page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from '../Login';

const m = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { signInWithPassword: m.signInWithPassword, getSession: m.getSession, signOut: m.signOut, resetPasswordForEmail: m.resetPasswordForEmail, verifyOtp: m.verifyOtp },
    functions: { invoke: m.invoke },
  },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/assets/basserh-logo.jpg', () => ({ default: 'logo.jpg' }));
const wa = vi.hoisted(() => ({ supports: vi.fn(() => true), startAuthentication: vi.fn(), startRegistration: vi.fn() }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: wa.supports, startAuthentication: wa.startAuthentication, startRegistration: wa.startRegistration,
}));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
document.elementFromPoint = () => null;

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}
const queryClient = new QueryClient();
function renderLogin(at = '/login') {
  return render(
    <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/code" element={<Login />} />
        <Route path="/" element={<Probe />} />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}
const submitLogin = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: password } });
  fireEvent.submit(screen.getByLabelText('كلمة المرور').closest('form') as HTMLFormElement);
};
/** The one-time-code check the edge function answers with. */
const otpCheck = (data: Record<string, unknown>) => m.invoke.mockImplementation(async (name: string) =>
  name === 'second-factor' ? { data, error: null } : { data: {}, error: null });

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    m.signInWithPassword.mockResolvedValue({ error: null });
    m.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    m.invoke.mockResolvedValue({ data: {}, error: null });
  });
  // The code input (input-otp) schedules 0, 10 and 50 ms timers on every
  // change and never clears them. Let them fire while the DOM still exists,
  // or the last test of a loaded run tears the environment down under them.
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

  it('refuses a bad email or a short password before reaching the server', async () => {
    renderLogin();
    // The schema loads on submit, so the refusal lands a tick later.
    submitLogin('not-an-email', 'secret1');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('البريد الإلكتروني غير صالح'));
    submitLogin('pm@example.com', '123');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('كلمة المرور يجب أن تكون 6 أحرف على الأقل'));
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
    expect(m.invoke).toHaveBeenNthCalledWith(1, 'second-factor', { body: { action: 'check', fingerprint } });
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
    expect(m.invoke).toHaveBeenLastCalledWith('second-factor', { body: { action: 'verify', code: '111111', fingerprint } });
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
    fireEvent.click(screen.getByText('الدخول بحساب آخر'));
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

  it('tells a person asking for a second reset link within the minute to wait, not that something broke', async () => {
    m.resetPasswordForEmail.mockResolvedValue({ error: Object.assign(new Error('For security purposes, you can only request this after 60 seconds.'), { status: 429 }) });
    renderLogin();
    fireEvent.click(screen.getByText('نسيت كلمة المرور؟'));
    const email = await screen.findByLabelText('البريد الإلكتروني');
    fireEvent.change(email, { target: { value: 'pm@example.com' } });
    fireEvent.submit(email.closest('form') as HTMLFormElement);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('طُلب رابط قبل قليل. انتظر دقيقة ثم أعد الطلب.'));
  });

  it('falls back to admin-otp when a browser cannot reach an undeployed second-factor at all', async () => {
    // What a browser really gets: the CORS preflight of a missing function fails.
    const unreachable = Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') });
    m.invoke.mockImplementation(async (name: string) => {
      if (name === 'second-factor') return { data: null, error: unreachable };
      if (name === 'admin-otp') return { data: { requiresOtp: true, sent: true }, error: null };
      return { data: {}, error: null };
    });
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it('falls back to admin-otp while second-factor is not deployed yet, and asks for the code the same way', async () => {
    const missing = Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError', context: { status: 404 } });
    m.invoke.mockImplementation(async (name: string) => {
      if (name === 'second-factor') return { data: null, error: missing };
      if (name === 'admin-otp') return { data: { requiresOtp: true, sent: true }, error: null };
      return { data: {}, error: null };
    });
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
    const fingerprint = localStorage.getItem('rouya_device_fp');
    expect(m.invoke).toHaveBeenCalledWith('admin-otp', { body: { action: 'check', fingerprint } });
  });

  it('does not fall back on a refusal: a second-factor error signs out', async () => {
    m.invoke.mockImplementation(async (name: string) =>
      name === 'second-factor' ? { data: null, error: Object.assign(new Error('x'), { name: 'FunctionsHttpError', context: { status: 500 } }) } : { data: {}, error: null });
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    await waitFor(() => expect(m.signOut).toHaveBeenCalled());
    expect(m.invoke).not.toHaveBeenCalledWith('admin-otp', expect.anything());
  });

  it('checks without forcing a new code, and refreshes what was read before the code passed', async () => {
    otpCheck({ requiresOtp: true, sent: true });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderLogin();
    submitLogin('pm@example.com', 'secret1');
    expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
    const fingerprint = localStorage.getItem('rouya_device_fp');
    expect(m.invoke).toHaveBeenCalledWith('second-factor', { body: { action: 'check', fingerprint } });
    m.invoke.mockImplementation(async (name: string, opts?: { body?: { action?: string } }) =>
      name === 'second-factor' && opts?.body?.action === 'verify' ? { data: { verified: true }, error: null } : { data: {}, error: null });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '123456' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);
    await screen.findByTestId('path');
    expect(invalidate).toHaveBeenCalled();
    invalidate.mockRestore();
  });

  it('resumes at the code step for a session sent back to finish it, without asking the password again', async () => {
    otpCheck({ requiresOtp: true, sent: true });
    renderLogin('/login/code');
    expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
    expect(m.signInWithPassword).not.toHaveBeenCalled();
    expect(m.invoke).toHaveBeenCalledWith('second-factor', { body: { action: 'check', fingerprint: localStorage.getItem('rouya_device_fp') } });
  });

  it('goes straight home when the resumed session turns out to have passed already', async () => {
    otpCheck({ requiresOtp: false });
    renderLogin('/login/code');
    expect(await screen.findByTestId('path')).toHaveTextContent('/');
  });

  it('never shows the password form on the code URL and returns cleanly when the session expired', async () => {
    m.getSession.mockResolvedValueOnce({ data: { session: null } });
    renderLogin('/login/code');
    expect(screen.getByRole('status')).toHaveTextContent('جاري تجهيز التحقق الآمن');
    expect(screen.queryByText('تسجيل الدخول', { selector: 'h2' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('تسجيل الدخول', { selector: 'h2' })).toBeInTheDocument());
    expect(toast.error).toHaveBeenCalledWith('انتهت جلسة الدخول. أدخل البريد وكلمة المرور من جديد.');
  });

  describe('passkey instead of the code', () => {
    const holdAtCode = async () => {
      otpCheck({ requiresOtp: true, sent: true });
      renderLogin();
      submitLogin('pm@example.com', 'secret1');
      expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
      return screen.getByRole('button', { name: /التحقق بمفتاح المرور/ });
    };
    /** Answers the passkeys function per action, the second factor as before. */
    const passkeys = (byAction: Record<string, unknown>) => m.invoke.mockImplementation(async (name: string, opts?: { body?: { action?: string } }) => {
      if (name === 'passkeys') return { data: byAction[opts?.body?.action ?? ''] ?? {}, error: null };
      if (name === 'second-factor') return { data: { requiresOtp: true, sent: true }, error: null };
      return { data: {}, error: null };
    });

    it('verifies with the passkey and the device fingerprint, then goes home', async () => {
      const button = await holdAtCode();
      passkeys({ 'auth-options': { options: { challenge: 'c1' } }, 'auth-verify': { verified: true } });
      wa.startAuthentication.mockResolvedValue({ id: 'cred-1', response: { signature: 's' } });
      fireEvent.click(button);
      await screen.findByTestId('path');
      expect(screen.getByTestId('path')).toHaveTextContent('/');
      const fingerprint = localStorage.getItem('rouya_device_fp');
      expect(wa.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c1' } });
      expect(m.invoke).toHaveBeenCalledWith('passkeys', { body: { action: 'auth-verify', response: { id: 'cred-1', response: { signature: 's' } }, fingerprint } });
      expect(m.invoke).toHaveBeenLastCalledWith('accept-invite', { body: {} });
      expect(toast.success).toHaveBeenCalledWith('تم التحقق بمفتاح المرور');
    });

    it('tells an account without passkeys to use the code, and stays', async () => {
      const button = await holdAtCode();
      passkeys({ 'auth-options': { noPasskeys: true } });
      fireEvent.click(button);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('لا يوجد مفتاح مرور مسجّل')));
      expect(wa.startAuthentication).not.toHaveBeenCalled();
      expect(screen.getByText('التحقق بخطوتين')).toBeInTheDocument();
      expect(screen.queryByTestId('path')).not.toBeInTheDocument();
    });

    it('keeps the code step when the person cancels the passkey prompt', async () => {
      const button = await holdAtCode();
      passkeys({ 'auth-options': { options: { challenge: 'c1' } } });
      wa.startAuthentication.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
      fireEvent.click(button);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('أُلغي التحقق أو انتهت مهلته. حاول مرة أخرى.'));
      expect(m.invoke).not.toHaveBeenCalledWith('passkeys', expect.objectContaining({ body: expect.objectContaining({ action: 'auth-verify' }) }));
      expect(screen.getByText('التحقق بخطوتين')).toBeInTheDocument();
    });

    it('offers no passkey button where the browser cannot run one', async () => {
      wa.supports.mockReturnValue(false);
      try {
        otpCheck({ requiresOtp: true, sent: true });
        renderLogin();
        submitLogin('pm@example.com', 'secret1');
        expect(await screen.findByText('التحقق بخطوتين')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /التحقق بمفتاح المرور/ })).not.toBeInTheDocument();
      } finally {
        wa.supports.mockReturnValue(true);
      }
    });
  });

  describe('passkey alone, from the login page', () => {
    /** Answers the passkeys function per action; anything else answers empty. */
    const passkeys = (byAction: Record<string, unknown>) => m.invoke.mockImplementation(async (name: string, opts?: { body?: { action?: string } }) =>
      ({ data: name === 'passkeys' ? byAction[opts?.body?.action ?? ''] ?? {} : {}, error: null }));
    const passkeyButton = () => screen.getByRole('button', { name: 'الدخول بمفتاح المرور' });

    it('opens the session from the server token, trusts the device, and goes home with no password or code', async () => {
      passkeys({ 'login-options': { options: { challenge: 'c9' }, challengeId: 'ch-9' }, 'login-verify': { verified: true, tokenHash: 'th-9' } });
      wa.startAuthentication.mockResolvedValue({ id: 'cred-1', response: { signature: 's', userHandle: 'u' } });
      m.verifyOtp.mockResolvedValue({ data: {}, error: null });
      renderLogin();
      fireEvent.click(passkeyButton());
      await screen.findByTestId('path');
      expect(screen.getByTestId('path')).toHaveTextContent('/');
      const fingerprint = localStorage.getItem('rouya_device_fp');
      expect(fingerprint).toBeTruthy();
      expect(wa.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c9' } });
      expect(m.invoke).toHaveBeenCalledWith('passkeys', { body: { action: 'login-verify', challengeId: 'ch-9', response: { id: 'cred-1', response: { signature: 's', userHandle: 'u' } }, fingerprint } });
      expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th-9', type: 'magiclink' });
      expect(m.invoke).toHaveBeenLastCalledWith('accept-invite', { body: {} });
      expect(m.signInWithPassword).not.toHaveBeenCalled();
      // The new session is checked like any other; the trusted device records it.
      expect(m.invoke).toHaveBeenCalledWith('second-factor', { body: { action: 'check', fingerprint } });
      expect(m.invoke).not.toHaveBeenCalledWith('admin-otp', expect.anything());
      expect(toast.success).toHaveBeenCalledWith('تم الدخول بمفتاح المرور');
    });

    it('shows the server refusal and stays, with no session opened', async () => {
      passkeys({ 'login-options': { options: { challenge: 'c9' }, challengeId: 'ch-9' }, 'login-verify': { verified: false, error: 'لا صلاحيات لهذا الحساب' } });
      wa.startAuthentication.mockResolvedValue({ id: 'cred-1', response: {} });
      renderLogin();
      fireEvent.click(passkeyButton());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('لا صلاحيات لهذا الحساب'));
      expect(m.verifyOtp).not.toHaveBeenCalled();
      expect(screen.queryByTestId('path')).not.toBeInTheDocument();
      expect(passkeyButton()).toBeEnabled();
    });

    it('when the device offers no passkey, says how to get one', async () => {
      passkeys({ 'login-options': { options: { challenge: 'c9' }, challengeId: 'ch-9' } });
      wa.startAuthentication.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
      renderLogin();
      fireEvent.click(passkeyButton());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('ادخل بكلمة المرور ثم أضفه من صفحة الأمان')));
      expect(m.invoke).not.toHaveBeenCalledWith('passkeys', expect.objectContaining({ body: expect.objectContaining({ action: 'login-verify' }) }));
    });

    it('stays on the page when the platform refuses the token, and says why', async () => {
      passkeys({ 'login-options': { options: { challenge: 'c9' }, challengeId: 'ch-9' }, 'login-verify': { verified: true, tokenHash: 'th-9' } });
      wa.startAuthentication.mockResolvedValue({ id: 'cred-1', response: {} });
      m.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: Object.assign(new Error('Token has expired or is invalid'), { status: 403 }) });
      renderLogin();
      fireEvent.click(passkeyButton());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('تعذّر فتح الجلسة، حاول مرة أخرى'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(m.invoke).not.toHaveBeenCalledWith('accept-invite', expect.anything());
      expect(screen.queryByTestId('path')).not.toBeInTheDocument();
    });

    it('while the device is asked, waits visibly and takes no second click or password', async () => {
      passkeys({ 'login-options': { options: { challenge: 'c9' }, challengeId: 'ch-9' } });
      wa.startAuthentication.mockReturnValue(new Promise(() => {}));
      renderLogin();
      fireEvent.click(passkeyButton());
      const waiting = await screen.findByRole('button', { name: 'بانتظار مفتاح المرور...' });
      expect(waiting).toBeDisabled();
      expect(screen.getByRole('button', { name: /تسجيل الدخول/ })).toBeDisabled();
      fireEvent.click(waiting);
      const starts = m.invoke.mock.calls.filter(([name, opts]) => name === 'passkeys' && (opts as { body: { action: string } }).body.action === 'login-options');
      expect(starts).toHaveLength(1);
    });

    it('is not offered where the browser cannot run a passkey', () => {
      wa.supports.mockReturnValue(false);
      try {
        renderLogin();
        expect(screen.queryByRole('button', { name: 'الدخول بمفتاح المرور' })).not.toBeInTheDocument();
      } finally {
        wa.supports.mockReturnValue(true);
      }
    });
  });
});
