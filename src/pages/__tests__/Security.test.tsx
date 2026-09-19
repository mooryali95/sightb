/**
 * The security page: lists the account's passkeys with their kind and
 * dates, registers a new one under a typed name, refuses a blank name
 * before touching the authenticator, and deletes after a confirmation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import Security from '../Security';

const m = vi.hoisted(() => ({
  list: vi.fn(), register: vi.fn(), del: vi.fn(), supported: vi.fn(() => true),
}));
vi.mock('@/services/passkeyService', async (orig) => ({
  ...(await orig<typeof import('@/services/passkeyService')>()),
  listPasskeys: m.list, registerPasskey: m.register, deletePasskey: m.del, passkeysSupported: m.supported,
}));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const phone = { id: 'pk-1', name: 'هاتفي', createdAt: '2026-09-01T00:00:00Z', lastUsedAt: '2026-09-18T00:00:00Z', deviceType: 'multiDevice', backedUp: true, transports: ['internal'] };
const key = { id: 'pk-2', name: 'مفتاح المكتب', createdAt: '2026-09-02T00:00:00Z', lastUsedAt: null, deviceType: 'singleDevice', backedUp: false, transports: ['usb'] };

describe('Security', () => {
  beforeEach(() => { vi.clearAllMocks(); m.supported.mockReturnValue(true); m.list.mockResolvedValue([phone, key]); });

  it('lists each passkey with its kind and whether it was used', async () => {
    render(<Security />);
    expect(await screen.findByText('هاتفي')).toBeInTheDocument();
    expect(screen.getByText(/مفتاح مزامَن عبر أجهزتك/)).toBeInTheDocument();
    expect(screen.getByText(/مفتاح على هذا الجهاز فقط/)).toBeInTheDocument();
    expect(screen.getByText(/لم يُستخدم بعد/)).toBeInTheDocument();
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
});
