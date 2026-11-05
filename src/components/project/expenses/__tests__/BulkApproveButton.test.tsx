import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { BulkApproveButton } from '../BulkApproveButton';
import type { Expense } from '@/types/project';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const exp = (id: string, amount: number, description: string) => ({ id, amount, description, approvalStatus: 'pending' }) as unknown as Expense;
const pending = [exp('e1', 1000.1, 'أسمنت'), exp('e2', 2000.2, 'حديد'), exp('e3', 500, 'نقل')];

describe('BulkApproveButton', () => {
  beforeEach(() => { vi.mocked(toast.success).mockClear(); vi.mocked(toast.error).mockClear(); });

  it('is not offered for fewer than two', () => {
    render(<BulkApproveButton pending={[pending[0]]} approve={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /اعتماد الكل/ })).toBeNull();
  });

  it('confirms the count and total, approves each in turn, and names what the system refused', async () => {
    const approve = vi.fn(async (id: string) => { if (id === 'e2') throw new Error('رصيد الدفعة لا يكفي'); });
    render(<BulkApproveButton pending={pending} approve={approve} />);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد الكل (3)' }));
    expect(await screen.findByText('اعتماد 3 مصروفات')).toBeInTheDocument();
    expect(screen.getByText(/3,500\.30 ر\.س/)).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(approve.mock.calls.map((c) => c[0])).toEqual(['e1', 'e2', 'e3']);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe('اعتُمد 2 من 3. لم يُعتمد «حديد»: رصيد الدفعة لا يكفي');
  });

  it('says so when all went through', async () => {
    render(<BulkApproveButton pending={pending} approve={vi.fn(async () => undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد الكل (3)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('اعتُمدت المصروفات كلها (3)'));
  });
});
