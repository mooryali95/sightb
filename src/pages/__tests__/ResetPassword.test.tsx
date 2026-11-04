/**
 * Component tests for the reset-password page. It is the landing point of
 * every invite and recovery email, so what must hold: the form only shows
 * once a recovery session is established by one of the four link shapes
 * (tokens in the hash, a code, a token hash, or an already-signed-in
 * recovery), a bad or unrecognised link is sent back to the login page,
 * a short password never reaches the server, and a saved password accepts
 * any pending invite and goes home with the server's refusal translated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import ResetPassword from '../ResetPassword';

const m = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  setSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  invoke: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: m.onAuthStateChange, setSession: m.setSession, exchangeCodeForSession: m.exchangeCodeForSession,
      verifyOtp: m.verifyOtp, getSession: m.getSession, updateUser: m.updateUser,
    },
    functions: { invoke: m.invoke },
  },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<Probe />} />
        <Route path="/" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}
/** Puts the recovery link's query and hash on the window before the page reads them. */
const visit = (search = '', hash = '') => window.history.replaceState({}, '', `/reset-password${search}${hash}`);
const form = () => screen.findByRole('button', { name: 'حفظ كلمة المرور' });
const verifying = () => screen.queryByText('جاري التحقق من الرابط...');
let authEvent: (event: string) => void = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.onAuthStateChange.mockImplementation((cb: (event: string) => void) => {
    authEvent = cb;
    return { data: { subscription: { unsubscribe: m.unsubscribe } } };
  });
  m.setSession.mockResolvedValue({ error: null });
  m.exchangeCodeForSession.mockResolvedValue({ error: null });
  m.verifyOtp.mockResolvedValue({ error: null });
  m.getSession.mockResolvedValue({ data: { session: null } });
  m.updateUser.mockResolvedValue({ error: null });
  m.invoke.mockResolvedValue({ data: {}, error: null });
  visit();
});
afterEach(() => { vi.useRealTimers(); });

describe('establishing the recovery session', () => {
  it('holds the form until the link is verified, then sets the session from hash tokens and scrubs them from the URL', async () => {
    visit('', '#access_token=at&refresh_token=rt&type=recovery');
    renderPage();
    expect(verifying()).toBeInTheDocument();
    expect(await form()).toBeInTheDocument();
    expect(m.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/reset-password');
    expect(m.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges a code, or verifies a recovery token hash, and never both', async () => {
    visit('?code=abc');
    const first = renderPage();
    expect(await form()).toBeInTheDocument();
    expect(m.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(m.verifyOtp).not.toHaveBeenCalled();
    first.unmount();

    visit('?token_hash=th&type=recovery');
    const second = renderPage();
    expect(await form()).toBeInTheDocument();
    expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'recovery' });
    expect(m.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    second.unmount();

    // A token hash that does not say it is a recovery is not verified as one.
    visit('?token_hash=th&type=magiclink');
    renderPage();
    await act(async () => { await Promise.resolve(); });
    expect(m.verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifying()).toBeInTheDocument();
  });

  it('accepts a recovery that is already signed in, or announced by the auth client', async () => {
    visit('?type=recovery');
    m.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    const first = renderPage();
    expect(await form()).toBeInTheDocument();
    first.unmount();

    // The same session without the recovery type is just a signed-in user who opened the page.
    visit();
    const second = renderPage();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(verifying()).toBeInTheDocument();
    second.unmount();

    visit();
    renderPage();
    expect(verifying()).toBeInTheDocument();
    act(() => authEvent('PASSWORD_RECOVERY'));
    expect(await form()).toBeInTheDocument();
  });

  it('ignores a plain sign-in unless the link said it was a recovery', async () => {
    renderPage();
    act(() => authEvent('SIGNED_IN'));
    expect(verifying()).toBeInTheDocument();

    visit('?type=recovery');
    renderPage();
    act(() => authEvent('SIGNED_IN'));
    expect(await form()).toBeInTheDocument();
  });
});

describe('a link that cannot be used', () => {
  it('sends an expired link back to the login page after a moment, without touching the auth client', async () => {
    vi.useFakeTimers();
    visit('', '#error=access_denied&error_description=Email+link+is+invalid+or+has+expired');
    renderPage();
    expect(toast.error).toHaveBeenCalledWith('الرابط منتهي الصلاحية أو غير صالح. يرجى طلب رابط جديد.');
    expect(m.onAuthStateChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByTestId('path')).toHaveTextContent('/login');
  });

  it('gives an unrecognised link five seconds, then sends it back too', async () => {
    vi.useFakeTimers();
    renderPage();
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(4999); });
    expect(toast.error).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(toast.error).toHaveBeenCalledWith('لم يتم التعرف على رابط الدعوة أو الاستعادة. يرجى طلب رابط جديد.');
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByTestId('path')).toHaveTextContent('/login');
  });

  it('translates a missing session on the token exchange and sends it back', async () => {
    vi.useFakeTimers();
    visit('?code=stale');
    m.exchangeCodeForSession.mockResolvedValue({ error: new Error('Auth session missing!') });
    renderPage();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(toast.error).toHaveBeenCalledWith('انتهت جلسة الدعوة أو الاستعادة. افتح الرابط من البريد مرة أخرى.');
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByTestId('path')).toHaveTextContent('/login');
  });

  it('stops listening and cancels the fallback when it unmounts', async () => {
    vi.useFakeTimers();
    const page = renderPage();
    await act(async () => { await Promise.resolve(); });
    page.unmount();
    expect(m.unsubscribe).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('saving the new password', () => {
  const ready = async () => {
    visit('?code=ok');
    renderPage();
    await form();
  };
  // By placeholder: the page's label has no `htmlFor`; the shared Input links it (see below).
  const field = () => screen.getByPlaceholderText('••••••••');
  const submit = (password: string) => {
    fireEvent.change(field(), { target: { value: password } });
    fireEvent.submit(field().closest('form') as HTMLFormElement);
  };

  it('names the field by its visible label although the page never wires it', async () => {
    await ready();
    // The page (Lovable-authored) still writes the label with no `htmlFor`;
    // the shared Input links the nearest label before it, so the name is heard.
    expect(screen.getByText('كلمة المرور الجديدة').getAttribute('for')).toBeNull();
    expect(field()).toHaveAccessibleName('كلمة المرور الجديدة');
  });

  it('refuses a short password before reaching the server', async () => {
    await ready();
    submit('12345');
    expect(toast.error).toHaveBeenCalledWith('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it('updates the password, accepts any pending invite, and goes home', async () => {
    await ready();
    submit('secret-1');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
    expect(m.updateUser).toHaveBeenCalledWith({ password: 'secret-1' });
    expect(m.invoke).toHaveBeenCalledWith('accept-invite', { body: {} });
    expect(toast.success).toHaveBeenCalledWith('تم تغيير كلمة المرور بنجاح');
  });

  it('still goes home when accepting the invite fails', async () => {
    m.invoke.mockRejectedValue(new Error('no invite'));
    await ready();
    submit('secret-1');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('stays on the page and translates the server\'s refusal', async () => {
    // As the auth service answers it: the code names the refusal, the prose does not say "same password".
    m.updateUser.mockResolvedValue({ error: Object.assign(new Error('New password should be different from the old password.'), { code: 'same_password', status: 422 }) });
    await ready();
    submit('secret-1');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('اختر كلمة مرور جديدة مختلفة عن الحالية.'));
    expect(screen.getByRole('button', { name: 'حفظ كلمة المرور' })).toBeEnabled();
    expect(m.invoke).not.toHaveBeenCalled();

    m.updateUser.mockResolvedValue({ error: new Error('Password is too weak') });
    submit('secret-2');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Password is too weak'));
    m.updateUser.mockResolvedValue({ error: { status: 500 } });
    submit('secret-3');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('حدث خطأ، يرجى المحاولة مرة أخرى'));
  });
});
