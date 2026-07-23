import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { splitSettle } from '../advanceSettlementService';

describe('advanceSettlementService.splitSettle', () => {
  beforeEach(() => rpcMock.mockReset());

  it('rejects when neither fund nor custody is provided', async () => {
    await expect(
      splitSettle({
        paymentRequestId: 'pr1',
        settleAmount: 100,
        overflowAmount: 50,
        overflowSource: {},
        expenseCategory: 'other',
        description: 'x',
      }),
    ).rejects.toThrow(/دفعة أو عهدة/);
  });

  it('rejects when both fund and custody are provided', async () => {
    await expect(
      splitSettle({
        paymentRequestId: 'pr1',
        settleAmount: 100,
        overflowAmount: 50,
        overflowSource: { fundId: 'f1', custodyId: 'c1' },
        expenseCategory: 'other',
        description: 'x',
      }),
    ).rejects.toThrow(/مصدراً واحداً/);
  });

  it('calls RPC with fund source and maps result', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { event_id: 'e1', expense_id: 'x1', overflow_amount: 50, settle_amount: 100 },
      error: null,
    });
    const res = await splitSettle({
      paymentRequestId: 'pr1',
      settleAmount: 100,
      overflowAmount: 50,
      overflowSource: { fundId: 'f1' },
      expenseCategory: 'materials',
      description: 'test',
      date: '2026-01-15',
      month: 1,
    });
    expect(res).toEqual({ eventId: 'e1', expenseId: 'x1', overflowAmount: 50, settleAmount: 100 });
    expect(rpcMock).toHaveBeenCalledWith('split_settle_advance', expect.objectContaining({
      _overflow_source: 'fund',
      _overflow_fund_id: 'f1',
      _overflow_custody_id: null,
    }));
  });

  it('maps advance_not_outstanding to Arabic message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'advance_not_outstanding' } });
    await expect(
      splitSettle({
        paymentRequestId: 'pr1',
        settleAmount: 100,
        overflowAmount: 50,
        overflowSource: { custodyId: 'c1' },
        expenseCategory: 'other',
        description: 'x',
      }),
    ).rejects.toThrow('السلفة مسوّاة بالفعل');
  });

  it('maps insufficient_permission to Arabic message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'insufficient_permission' } });
    await expect(
      splitSettle({
        paymentRequestId: 'pr1',
        settleAmount: 100,
        overflowAmount: 50,
        overflowSource: { fundId: 'f1' },
        expenseCategory: 'other',
        description: 'x',
      }),
    ).rejects.toThrow('لا تملك صلاحية التسوية');
  });
});
