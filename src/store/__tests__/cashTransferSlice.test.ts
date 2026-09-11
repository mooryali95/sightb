/**
 * The eighth layer: cash moving from a fund into someone's custody.
 *
 * This slice is small, and that is exactly why it was worth writing down. Every
 * row it holds is cash that left one place and arrived at another, so a list
 * that gains a duplicate row or loses a numeric coercion reports money that is
 * not where it says it is — and nothing about that looks wrong on screen.
 *
 * `applyCashTransferRealtimeEvent` carries a comment saying it was exported so
 * it could be tested directly. Until now it had no test. It is a pure function
 * over a list, so most of this file needs no mocking at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';
import {
  applyCashTransferRealtimeEvent,
  type CashTransferRow,
} from '@/store/slices/cashTransferSlice';
import type { CashTransfer } from '@/types/project';

const mock = await vi.hoisted(async () => {
  const { makeDbMock } = await import('./db-mock');
  return makeDbMock();
});

vi.mock('@/services/db', () => ({ db: mock.db }));
vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
}));

const PROJECT = 'proj-1';

function row(over: Partial<CashTransferRow> = {}): CashTransferRow {
  return {
    id: 'tr-1', project_id: PROJECT, from_fund_id: 'fund-1',
    to_custody_id: 'cust-1', amount: 1500, transfer_date: '2026-01-05',
    created_at: '2026-01-05T00:00:00.000Z',
    ...over,
  };
}

function transfer(over: Partial<CashTransfer> = {}): CashTransfer {
  return {
    id: 'tr-1', projectId: PROJECT, fromFundId: 'fund-1', toCustodyId: 'cust-1',
    amount: 1500, transferDate: '2026-01-05', createdAt: '2026-01-05T00:00:00.000Z',
    ...over,
  };
}

const store = () => useStore.getState();

beforeEach(() => {
  mock.reset();
  useStore.setState({ cashTransfers: [] });
});

describe('the realtime reducer never counts the same transfer twice', () => {
  /**
   * The one that matters. A client that just inserted a transfer also receives
   * its own row back over realtime; without this guard the same cash appears in
   * the list twice and every custody total built from it is overstated.
   */
  it('ignores an INSERT for a transfer already in the list', () => {
    const list = [transfer()];

    const next = applyCashTransferRealtimeEvent(list, { eventType: 'INSERT', new: row() });

    expect(next).toHaveLength(1);
  });

  /**
   * And it returns the list it was given, not a copy of it. A reducer that
   * rebuilt the array on every echo would re-render every consumer for an event
   * that changed nothing.
   */
  it('returns the same array reference when the INSERT is a duplicate', () => {
    const list = [transfer()];

    expect(applyCashTransferRealtimeEvent(list, { eventType: 'INSERT', new: row() })).toBe(list);
  });

  it('prepends a genuinely new transfer', () => {
    const list = [transfer()];

    const next = applyCashTransferRealtimeEvent(list, {
      eventType: 'INSERT', new: row({ id: 'tr-2', amount: 900 }),
    });

    expect(next.map((t) => t.id)).toEqual(['tr-2', 'tr-1']);
    expect(next[0].amount).toBe(900);
  });

  it('replaces a transfer in place on UPDATE, keeping its position', () => {
    const list = [transfer({ id: 'tr-2' }), transfer({ id: 'tr-1' })];

    const next = applyCashTransferRealtimeEvent(list, {
      eventType: 'UPDATE', new: row({ id: 'tr-1', amount: 2000 }),
    });

    expect(next.map((t) => t.id)).toEqual(['tr-2', 'tr-1']);
    expect(next.find((t) => t.id === 'tr-1')?.amount).toBe(2000);
  });

  /**
   * An UPDATE for a row this client never had must not smuggle it in. The list
   * is scoped to one project; an update arriving for another project's row
   * would otherwise add cash that does not belong to the view.
   */
  it('adds nothing on an UPDATE for an unknown transfer', () => {
    const list = [transfer()];

    const next = applyCashTransferRealtimeEvent(list, {
      eventType: 'UPDATE', new: row({ id: 'ghost' }),
    });

    expect(next.map((t) => t.id)).toEqual(['tr-1']);
  });

  it('removes the deleted row, and only that one', () => {
    const list = [transfer({ id: 'tr-1' }), transfer({ id: 'tr-2' })];

    const next = applyCashTransferRealtimeEvent(list, {
      eventType: 'DELETE', old: { id: 'tr-1' },
    });

    expect(next.map((t) => t.id)).toEqual(['tr-2']);
  });

  it('leaves the list alone for a DELETE with no id, and for an unknown event', () => {
    const list = [transfer()];

    expect(applyCashTransferRealtimeEvent(list, { eventType: 'DELETE', old: {} })).toBe(list);
    expect(applyCashTransferRealtimeEvent(list, { eventType: 'TRUNCATE' })).toBe(list);
    expect(applyCashTransferRealtimeEvent(list, { eventType: 'INSERT' })).toBe(list);
  });

  /**
   * PostgREST returns numeric columns as strings. Lose the Number() and the
   * amount stays a string, at which point every sum built on it concatenates
   * instead of adding — 1500 + 900 becomes "1500900" rather than 2400.
   */
  it('coerces the amount to a number, whatever the wire sent', () => {
    const next = applyCashTransferRealtimeEvent([], {
      eventType: 'INSERT', new: row({ amount: '1500' }),
    });

    expect(next[0].amount).toBe(1500);
    expect(typeof next[0].amount).toBe('number');
    expect(next[0].amount + 900).toBe(2400);
  });
});

describe('loading a project replaces only that project', () => {
  it('keeps another project\'s transfers untouched', async () => {
    useStore.setState({
      cashTransfers: [transfer({ id: 'other', projectId: 'proj-2' }), transfer({ id: 'stale' })],
    });
    mock.on('cash_transfers', 'select', () => ({ data: [row({ id: 'fresh' })] }));

    await store().loadCashTransfersForProject(PROJECT);

    const ids = store().cashTransfers.map((t) => t.id).sort();
    expect(ids).toEqual(['fresh', 'other']);
  });

  it('coerces amounts on the loaded rows too', async () => {
    mock.on('cash_transfers', 'select', () => ({ data: [row({ amount: '2750.50' })] }));

    await store().loadCashTransfersForProject(PROJECT);

    expect(store().cashTransfers[0].amount).toBe(2750.5);
  });
});

describe('creating a transfer', () => {
  it('sends the movement as given and drops whitespace-only notes', async () => {
    mock.on('cash_transfers', 'insert', () => ({ data: row({ id: 'tr-new' }) }));

    const id = await store().createCashTransfer({
      projectId: PROJECT, fromFundId: 'fund-1', toCustodyId: 'cust-1',
      amount: 1500, transferDate: '2026-01-05', notes: '   ',
    });

    expect(id).toBe('tr-new');
    expect(mock.find('cash_transfers', 'insert')?.payload).toMatchObject({
      project_id: PROJECT, from_fund_id: 'fund-1', to_custody_id: 'cust-1',
      amount: 1500, notes: null,
    });
    expect(store().cashTransfers.map((t) => t.id)).toEqual(['tr-new']);
  });

  it('leaves local state alone when the insert fails', async () => {
    mock.on('cash_transfers', 'insert', () => ({ error: { message: 'boom' } }));

    await expect(store().createCashTransfer({
      projectId: PROJECT, fromFundId: 'fund-1', toCustodyId: 'cust-1',
      amount: 1500, transferDate: '2026-01-05',
    })).rejects.toBeDefined();

    expect(store().cashTransfers).toHaveLength(0);
  });
});

/**
 * The optimistic delete used by the undo flow: the row leaves the list before
 * the database is asked, and comes back if the user undoes or the write fails.
 */
describe('the optimistic remove and its undo', () => {
  beforeEach(() => {
    useStore.setState({ cashTransfers: [transfer({ id: 'tr-1' }), transfer({ id: 'tr-2' })] });
  });

  it('hands back the row it removed, so it can be put back', () => {
    const removed = store().removeCashTransferLocal('tr-1');

    expect(removed).toMatchObject({ id: 'tr-1', amount: 1500 });
    expect(store().cashTransfers.map((t) => t.id)).toEqual(['tr-2']);
  });

  it('returns null and changes nothing for a row that is not there', () => {
    expect(store().removeCashTransferLocal('ghost')).toBeNull();
    expect(store().cashTransfers).toHaveLength(2);
  });

  it('puts the row back on undo', () => {
    const removed = store().removeCashTransferLocal('tr-1')!;

    store().restoreCashTransferLocal(removed);

    expect(store().cashTransfers.map((t) => t.id).sort()).toEqual(['tr-1', 'tr-2']);
  });

  /**
   * Undo can race the realtime echo of the same delete being reverted. Restoring
   * a row that is already back must not double it — the same duplication risk
   * as the INSERT guard above, reached from the other direction.
   */
  it('does not duplicate a row that is already back', () => {
    store().restoreCashTransferLocal(transfer({ id: 'tr-1' }));

    expect(store().cashTransfers.filter((t) => t.id === 'tr-1')).toHaveLength(1);
  });
});
