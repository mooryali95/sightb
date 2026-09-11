/**
 * The eleventh layer: expenses, revenues and budget items.
 *
 * These are the most-written money records in the app, and one of them —
 * `addExpense` — is the only write that survives losing the network. A field
 * expense recorded with no signal is queued locally and replayed later, which
 * makes identity the whole game: if the queued row and the replayed row do not
 * share a primary key, the same spend lands in the ledger twice.
 *
 * The rest is quieter but not smaller. Several writes fire database triggers
 * that recompute fund and custody totals, so the slice reloads those after the
 * fact — and must not fail the write when that reload does, because by then the
 * money is already recorded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';

const mock = await vi.hoisted(async () => {
  const { makeDbMock } = await import('./db-mock');
  return makeDbMock();
});

vi.mock('@/services/db', () => ({ db: mock.db }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
  logDeletion: vi.fn().mockResolvedValue(undefined),
}));

const PROJECT = 'proj-1';
const loadFundsForProject = vi.fn().mockResolvedValue(undefined);
const loadResourcePayablesForProject = vi.fn().mockResolvedValue(undefined);

function newExpense(over: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT, category: 'materials', description: 'إسمنت',
    amount: 750, date: '2026-02-01', month: 2,
    ...over,
  } as never;
}

const store = () => useStore.getState();

beforeEach(() => {
  mock.reset();
  vi.clearAllMocks();
  useStore.setState({
    expenses: [], revenues: [], budgetItems: [],
    loadFundsForProject, loadResourcePayablesForProject,
  } as never);
  // The online path returns the inserted rows; the slice reads data[0].
  mock.on('expenses', 'insert', (c) => ({ data: [c.payload] }));
});

describe('a field expense keeps its identity across the offline queue', () => {
  /**
   * The one that matters. The id is minted here rather than by the database so
   * the optimistic row and the row replayed from the queue are the same row.
   * A server-generated id would make the replay a second, separate expense —
   * the same money counted twice, with nothing marking either as the duplicate.
   */
  it('sends an id of its own rather than letting the database mint one', async () => {
    const id = await store().addExpense(newExpense());

    const sent = mock.find('expenses', 'insert')?.payload as Record<string, unknown>;
    expect(sent.id).toBeDefined();
    expect(String(sent.id)).toMatch(/^[0-9a-f-]{36}$/i);
    // and the id handed back is that same row's id, not a second one
    expect(id).toBe(sent.id);
    expect(store().expenses[0].id).toBe(sent.id);
  });

  it('gives two expenses two different ids', async () => {
    const a = await store().addExpense(newExpense({ description: 'أ' }));
    const b = await store().addExpense(newExpense({ description: 'ب' }));

    expect(a).not.toBe(b);
    expect(store().expenses).toHaveLength(2);
  });

  /**
   * The offline flag is what makes the queue available at all. Without it a
   * write with no signal throws instead of being kept, and a field entry made
   * out of coverage is simply lost.
   */
  it('asks for the offline-capable path', async () => {
    await store().addExpense(newExpense());

    expect(mock.find('expenses', 'insert')?.options).toMatchObject({ offline: true });
  });

  /**
   * When the write was queued rather than sent, there is no server row to map,
   * so the local one stands in — and the follow-up reloads are skipped, because
   * no trigger has run to change anything they would fetch.
   */
  it('shows the queued row and skips the reloads when there is no network', async () => {
    mock.on('expenses', 'insert', () => ({ data: null, queuedOffline: true } as never));

    const id = await store().addExpense(newExpense({ fundId: 'fund-1', amount: 750 }));

    expect(store().expenses[0]).toMatchObject({ id, amount: 750, fundId: 'fund-1' });
    expect(loadFundsForProject).not.toHaveBeenCalled();
  });
});

describe('the reloads after a write, and what they must not break', () => {
  it('refreshes the funds when the expense was paid from one', async () => {
    await store().addExpense(newExpense({ fundId: 'fund-1' }));

    expect(loadFundsForProject).toHaveBeenCalledWith(PROJECT);
  });

  it('leaves the funds alone when no fund was involved', async () => {
    await store().addExpense(newExpense());

    expect(loadFundsForProject).not.toHaveBeenCalled();
  });

  it('refreshes the payables when the expense settles one', async () => {
    await store().addExpense(newExpense({ reimbursesPayableId: 'pay-1' }));

    expect(loadResourcePayablesForProject).toHaveBeenCalledWith(PROJECT);
  });

  /**
   * By the time the reload runs the expense is already written. Letting the
   * reload's failure escape would report a failed save for money that is in the
   * ledger, and invite the user to record it a second time.
   */
  it('does not fail the save when the refresh fails', async () => {
    loadFundsForProject.mockRejectedValueOnce(new Error('offline'));

    await expect(store().addExpense(newExpense({ fundId: 'fund-1' }))).resolves.toBeDefined();
    expect(store().expenses).toHaveLength(1);
  });
});

describe('defaults that decide how an expense is counted', () => {
  it('records an expense as approved and VAT-inclusive unless told otherwise', async () => {
    await store().addExpense(newExpense());

    expect(mock.find('expenses', 'insert')?.payload).toMatchObject({
      approval_status: 'approved',
      is_vat_exempt: false,
    });
  });

  it('keeps an explicit pending status and VAT exemption', async () => {
    await store().addExpense(newExpense({ approvalStatus: 'pending', isVatExempt: true }));

    expect(mock.find('expenses', 'insert')?.payload).toMatchObject({
      approval_status: 'pending',
      is_vat_exempt: true,
    });
  });

  /**
   * `isVatExempt` is a boolean the caller may legitimately set to false, so the
   * default has to distinguish "not given" from "given as false". `||` would
   * collapse the two, which is harmless here and would not be if the default
   * were true.
   */
  it('treats an explicit false as a choice, not as absence', async () => {
    await store().addExpense(newExpense({ isVatExempt: false }));

    expect(mock.find('expenses', 'insert')?.payload).toMatchObject({ is_vat_exempt: false });
  });
});

describe('updating and deleting an expense', () => {
  beforeEach(() => {
    useStore.setState({
      expenses: [
        { id: 'e1', projectId: PROJECT, amount: 750, fundId: 'fund-1', description: 'إسمنت' },
        { id: 'e2', projectId: PROJECT, amount: 200, description: 'أخرى' },
      ],
    } as never);
  });

  it('sends only the fields the patch names', async () => {
    await store().updateExpense('e1', { amount: 900 } as never);

    const sent = mock.find('expenses', 'update')?.payload as Record<string, unknown>;
    expect(sent).toEqual({ amount: 900 });
    expect(store().expenses.find((e) => e.id === 'e1')?.amount).toBe(900);
  });

  /**
   * A changed amount or fund moves a fund's remaining balance through a
   * database trigger, so the totals on screen are stale until they are refetched.
   * A change to neither cannot move them, and refetching anyway would be a
   * round trip per keystroke on a description.
   */
  it('refreshes the funds when the amount moves', async () => {
    await store().updateExpense('e1', { amount: 900 } as never);

    expect(loadFundsForProject).toHaveBeenCalledWith(PROJECT);
  });

  it('leaves them alone when only the description changes', async () => {
    await store().updateExpense('e1', { description: 'إسمنت مقاوم' } as never);

    expect(loadFundsForProject).not.toHaveBeenCalled();
  });

  it('clears a link when the patch passes an empty fund', async () => {
    await store().updateExpense('e1', { fundId: '' } as never);

    expect(mock.find('expenses', 'update')?.payload).toMatchObject({ fund_id: null });
  });

  it('removes only the expense asked for, and refreshes its fund', async () => {
    await store().deleteExpense('e1');

    expect(store().expenses.map((e) => e.id)).toEqual(['e2']);
    expect(loadFundsForProject).toHaveBeenCalledWith(PROJECT);
  });

  it('skips the refresh when the deleted expense had no fund', async () => {
    await store().deleteExpense('e2');

    expect(loadFundsForProject).not.toHaveBeenCalled();
  });
});

describe('budget items', () => {
  it('defaults a new item to a fixed direct cost', async () => {
    mock.on('budget_items', 'insert', (c) => ({ data: c.payload }));

    await store().addBudgetItem({
      projectId: PROJECT, category: 'materials', description: 'حديد', plannedAmount: 5000,
    } as never);

    expect(mock.find('budget_items', 'insert')?.payload).toMatchObject({
      cost_type: 'fixed', cost_class: 'direct',
    });
  });

  it('patches only the named fields and leaves the rest standing', async () => {
    useStore.setState({
      budgetItems: [{
        id: 'bi-1', projectId: PROJECT, category: 'materials',
        description: 'حديد', plannedAmount: 5000, costType: 'fixed', costClass: 'direct',
      }],
    } as never);

    await store().updateBudgetItem('bi-1', { plannedAmount: 6000 } as never);

    expect(mock.find('budget_items', 'update')?.payload).toEqual({ planned_amount: 6000 });
    expect(store().budgetItems[0]).toMatchObject({
      plannedAmount: 6000, description: 'حديد', costClass: 'direct',
    });
  });

  it('removes only the item asked for', async () => {
    useStore.setState({
      budgetItems: [{ id: 'bi-1' }, { id: 'bi-2' }],
    } as never);

    await store().deleteBudgetItem('bi-1');

    expect(store().budgetItems.map((b) => b.id)).toEqual(['bi-2']);
  });
});
