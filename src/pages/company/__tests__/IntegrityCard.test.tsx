import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useStore, type AppState } from '@/store/useStore';
import type { CashTransfer, Custody, Expense, Project } from '@/types/project';
import { IntegrityCard } from '../IntegrityCard';

/**
 * The company opened directly, with the details already in the store but no
 * cash transfers: the card loads the transfers itself before judging, and
 * gives no verdict while it waits or when it cannot load them.
 */
const P = 'p1';
const project = { id: P, name: 'ألبانيا', status: 'active', contractValue: 0 } as Project;
const custody = { id: 'c1', projectId: P, resourceName: 'عهدة المشتريات', amount: 5000, status: 'active' } as Custody;
const spend = { id: 'e1', projectId: P, custodyId: 'c1', description: 'مشتريات', amount: 7000, date: '2026-03-10', approvalStatus: 'approved' } as Expense;
const transfer = { id: 't1', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 3000, transferDate: '2026-03-05' } as CashTransfer;

const loaders = (transfers: () => Promise<void>) => ({
  loadFundsForProject: vi.fn(async () => {}),
  loadResourcePayablesForProject: vi.fn(async () => {}),
  loadCashTransfersForProject: vi.fn(transfers),
});

beforeEach(() => {
  useStore.setState({
    detailsLoaded: true, expenses: [spend], custodies: [custody], cashTransfers: [], projectFunds: [], fundSettlements: [],
    revenues: [], reimbursements: [], paymentRequests: [], changeOrders: [],
  } as Partial<AppState>);
});

const show = () => render(<MemoryRouter><IntegrityCard projects={[project]} /></MemoryRouter>);

describe('IntegrityCard', () => {
  it('loads the transfers before judging, so a topped-up custody is not called overspent', async () => {
    const l = loaders(async () => { useStore.setState({ cashTransfers: [transfer] }); });
    useStore.setState(l as unknown as Partial<AppState>);
    show();
    await waitFor(() => expect(screen.getByText(/الحسابات مغلقة/)).toBeInTheDocument());
    expect(l.loadCashTransfersForProject).toHaveBeenCalledWith(P);
    expect(screen.queryByText(/أكثر من رصيدها/)).toBeNull();
  });

  it('says nothing about the books while loading, and admits it when loading fails', async () => {
    let fail: (e: Error) => void = () => {};
    useStore.setState(loaders(() => new Promise<void>((_, reject) => { fail = reject; })) as unknown as Partial<AppState>);
    show();
    expect(screen.getByText(/جارٍ فحص الحسابات/)).toBeInTheDocument();
    expect(screen.queryByText(/أكثر من رصيدها/)).toBeNull();
    fail(new Error('down'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل بيانات الفحص'));
    expect(screen.queryByText(/الحسابات مغلقة/)).toBeNull();
  });
});
