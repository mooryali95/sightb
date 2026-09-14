/**
 * Component tests for the cash repair log section, written before it is
 * split. The integrity audit and the live sync are unit-tested in lib;
 * what is pinned here is what the section loads, flags, confirms, books
 * and opens: the repairs fetched for the project, the orphan transfers
 * with their inflation, the repair flow with its reason check, the
 * optimistic removal and its rollback, the event recorded with the
 * balances before and after, and the detail of a logged repair.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CashTransfer, Custody, Expense, ProjectFund } from '@/types/project';
import { useStore, type AppState } from '@/store/useStore';
import { listCashTransferRepairs, repairOrphanCashTransfer, type CashTransferRepair } from '@/services/cashRepairService';
import { recordCashRepairEvent } from '@/lib/cash-repair-events';
import { CashRepairLogSection } from '../CashRepairLogSection';

vi.mock('@/services/cashRepairService', () => ({
  listCashTransferRepairs: vi.fn(),
  repairOrphanCashTransfer: vi.fn(),
}));
vi.mock('@/lib/cash-repair-events', () => ({ recordCashRepairEvent: vi.fn() }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const P = 'p-1';
const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];

const funds = fixture<ProjectFund>([{ id: 'f1', projectId: P, fundNumber: 1, amount: 50000, status: 'acknowledged', transferDate: '2026-08-01' }]);
const custodies = fixture<Custody>([
  { id: 'c1', projectId: P, resourceName: 'عمر', amount: 5000, spent: 0, remaining: 0, status: 'active', sourceFundId: 'f1', createdAt: '' },
]);
const expenses = fixture<Expense>([{ id: 'e1', projectId: P, custodyId: 'c1', amount: 1000, approvalStatus: 'approved', month: 8 }]);
const orphan: CashTransfer = { id: 't-orphan', projectId: P, fromFundId: 'f-missing', toCustodyId: 'c1', amount: 5000, transferDate: '2026-08-02', createdAt: '' };
const linked: CashTransfer = { id: 't-ok', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 2000, transferDate: '2026-08-03', createdAt: '' };

const logged: CashTransferRepair = {
  id: 'rep1', projectId: P, transferId: 't-old', custodyId: 'c1', custodyName: 'عمر', amount: 3000,
  transferDate: '2026-07-20', missingFundId: 'f-gone', reason: 'سجل يتيم بعد حذف دفعة', before: {
    custody: { custody_id: 'c1', base_amount: 5000, transfers_in: 3000, available: 8000, spent: 1000, outstanding_advances: 0, remaining: 7000 },
  }, after: {
    custody: { custody_id: 'c1', base_amount: 5000, transfers_in: 0, available: 5000, spent: 1000, outstanding_advances: 0, remaining: 4000 },
  }, performedBy: 'u1', performedByEmail: 'pm@example.com', createdAt: '2026-07-21T09:30:00Z',
};

const refreshCashDerivations = vi.fn(async () => {});
const onRepaired = vi.fn();

function seed(transfers: CashTransfer[]) {
  useStore.setState({
    expenses, custodies, paymentRequests: [], cashTransfers: transfers, projectFunds: funds, fundSettlements: [],
    refreshCashDerivations,
  } satisfies Partial<AppState>);
}

function renderSection(transfers: CashTransfer[] = [orphan, linked], readOnly = false) {
  seed(transfers);
  return render(
    <CashRepairLogSection
      projectId={P} custodies={custodies} cashTransfers={transfers} funds={funds} expenses={expenses}
      readOnly={readOnly} onRepaired={onRepaired}
    />,
  );
}

const repairButton = () => screen.getByRole('button', { name: 'إصلاح' });
const run = () => screen.getByRole('button', { name: 'تنفيذ الإصلاح' });

describe('CashRepairLogSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCashTransferRepairs).mockResolvedValue([logged]);
  });

  it('loads the repairs logged for the project and lists them with the custody, the amount, the day, the reason and who did it', async () => {
    renderSection();
    expect(screen.getByText('جارٍ التحميل…')).toBeInTheDocument();
    expect(listCashTransferRepairs).toHaveBeenCalledWith(P);
    const row = await screen.findByRole('button', { name: /عمر · 3,000/ });
    expect(row).toHaveTextContent('2026-07-21');
    expect(row).toHaveTextContent('سجل يتيم بعد حذف دفعة');
    expect(row).toHaveTextContent('pm@example.com');
  });

  it('shows the empty log and the all-clear when every transfer has a fund', async () => {
    vi.mocked(listCashTransferRepairs).mockResolvedValue([]);
    renderSection([linked]);
    expect(await screen.findByText('لا توجد عمليات إصلاح مسجّلة لهذا المشروع')).toBeInTheDocument();
    expect(screen.getByText('لا توجد تحويلات بلا مصدر')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إصلاح' })).not.toBeInTheDocument();
  });

  it('flags each orphan transfer with its custody, amount and date, totals the inflation, and hides the repair button when read only', async () => {
    const { unmount } = renderSection();
    expect(await screen.findByText('1 تحويل بلا مصدر')).toBeInTheDocument();
    expect(screen.getByText(/ترفع رصيد العهدة بمقدار 5,000/)).toBeInTheDocument();
    expect(screen.getByText(/^عمر · 5,000/)).toBeInTheDocument();
    expect(screen.getByText('2026-08-02')).toBeInTheDocument();
    expect(repairButton()).toBeEnabled();
    unmount();
    renderSection([orphan, linked], true);
    expect(screen.queryByRole('button', { name: 'إصلاح' })).not.toBeInTheDocument();
  });

  it('refuses a repair without a reason of five characters, then deletes the transfer, resyncs, records the balances before and after, and reports back', async () => {
    vi.mocked(repairOrphanCashTransfer).mockResolvedValue(undefined as never);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'إصلاح' }));
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveTextContent('إصلاح تحويل بلا دفعة أصل');
    expect(panel).toHaveTextContent('f-missing');
    expect(panel).toHaveTextContent('5,000');

    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'قصير' } });
    fireEvent.click(run());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'سبب الإصلاح مطلوب', variant: 'destructive' }));
    expect(repairOrphanCashTransfer).not.toHaveBeenCalled();

    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: '  سجل يتيم لا يقابله نقد  ' } });
    fireEvent.click(run());
    await waitFor(() => expect(onRepaired).toHaveBeenCalledTimes(1));

    expect(repairOrphanCashTransfer).toHaveBeenCalledWith('t-orphan', 'سجل يتيم لا يقابله نقد');
    expect(useStore.getState().cashTransfers.map((t) => t.id)).toEqual(['t-ok']);
    expect(refreshCashDerivations).toHaveBeenCalledWith(P);
    expect(listCashTransferRepairs).toHaveBeenCalledTimes(2);
    expect(recordCashRepairEvent).toHaveBeenCalledWith(expect.objectContaining({
      projectId: P, transferId: 't-orphan', custodyId: 'c1', custodyName: 'عمر', amount: 5000,
      before: expect.objectContaining({ custodyAvailable: 12000, custodySpent: 1000, custodyRemaining: 11000 }),
      after: expect.objectContaining({ custodyAvailable: 7000, custodySpent: 1000, custodyRemaining: 6000 }),
    }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'تم الإصلاح' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('puts the transfer back and reports the error when the server refuses the repair', async () => {
    vi.mocked(repairOrphanCashTransfer).mockRejectedValue(new Error('لا صلاحية'));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'إصلاح' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox'), { target: { value: 'سجل يتيم قديم' } });
    fireEvent.click(run());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'تعذّر الإصلاح', description: 'لا صلاحية', variant: 'destructive' })));
    expect(useStore.getState().cashTransfers.map((t) => t.id)).toEqual(['t-orphan', 't-ok']);
    expect(recordCashRepairEvent).not.toHaveBeenCalled();
    expect(onRepaired).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens a logged repair on its summary and the custody figures before and after', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: /عمر · 3,000/ }));
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveTextContent('تفاصيل عملية الإصلاح');
    expect(panel).toHaveTextContent('2026-07-21 09:30');
    expect(panel).toHaveTextContent('f-gone');
    expect(panel).toHaveTextContent('pm@example.com');
    const before = within(panel).getByText('قبل').parentElement as HTMLElement;
    expect(before).toHaveTextContent('3,000');
    expect(before).toHaveTextContent('7,000');
    const after = within(panel).getByText('بعد').parentElement as HTMLElement;
    expect(after).toHaveTextContent('4,000');
  });
});
