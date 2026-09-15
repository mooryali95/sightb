/**
 * Unit tests for the cash transfer slice: money moved from a fund into a
 * custody. Each transfer is written to the database and mirrored in the
 * store, and the repair log removes and restores rows locally while a
 * repair is in flight. The database is a recorder that keeps every call
 * chain and answers from a queue. The realtime reducer's happy paths are
 * already pinned by `lib/__tests__/cash-repair-live-sync.test.ts`; here
 * only its edges are added.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CashTransfer } from '@/types/project';

interface Call { table: string; options?: unknown; ops: [string, unknown[]][] }
const calls: Call[] = [];
const answers: unknown[] = [];
function builder(table: string, options?: unknown) {
  const call: Call = { table, options, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(answers.shift() ?? { data: null, error: null }).then(resolve, reject),
  };
  for (const op of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete', 'single']) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  return b;
}
vi.mock('@/services/db', () => ({ db: { from: (table: string, options?: unknown) => builder(table, options) }, unwrap: vi.fn() }));
vi.mock('../helpers', async (orig) => ({ ...(await orig<typeof import('../helpers')>()), getUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useStore } from '@/store/useStore';
import { applyCashTransferRealtimeEvent } from '@/store/slices/cashTransferSlice';

const P = 'p1';
const argOf = (i: number, op: string) => calls[i].ops.find(([o]) => o === op)?.[1][0];
const ops = (i: number) => calls[i].ops.map(([op, args]) => [op, ...args]);

const row = (over: Record<string, unknown> = {}) => ({
  id: 't-db', project_id: P, from_fund_id: 'f1', to_custody_id: 'c1', amount: '2500',
  transfer_date: '2026-09-01', notes: null, created_at: '2026-09-01T08:00:00Z', ...over,
});
const transfer = (over: Partial<CashTransfer> = {}): CashTransfer => ({
  id: 't1', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 1000,
  transferDate: '2026-08-01', createdAt: '2026-08-01T00:00:00Z', ...over,
});
const other = transfer({ id: 't-other', projectId: 'p2', toCustodyId: 'c9' });

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  vi.clearAllMocks();
  useStore.setState({ cashTransfers: [] });
});

describe('loading a project\'s transfers', () => {
  it('reads them newest first, maps the numeric amount and the empty note, and replaces only that project\'s rows', async () => {
    useStore.setState({ cashTransfers: [transfer({ id: 't-stale' }), other] });
    answers.push({ data: [row({ id: 't-a', amount: '2500' }), row({ id: 't-b', amount: 750.5, notes: 'دفعة أولى' })], error: null });

    await useStore.getState().loadCashTransfersForProject(P);

    expect(calls[0].table).toBe('cash_transfers');
    expect(ops(0)).toEqual([['select', '*'], ['eq', 'project_id', P], ['order', 'transfer_date', { ascending: false }]]);
    expect(useStore.getState().cashTransfers).toEqual([
      other,
      { id: 't-a', projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 2500, transferDate: '2026-09-01', notes: undefined, createdAt: '2026-09-01T08:00:00Z' },
      expect.objectContaining({ id: 't-b', amount: 750.5, notes: 'دفعة أولى' }),
    ]);
  });

  it('throws the database error and keeps the store as it was', async () => {
    useStore.setState({ cashTransfers: [transfer()] });
    answers.push({ data: null, error: new Error('RLS') });
    await expect(useStore.getState().loadCashTransfersForProject(P)).rejects.toThrow('RLS');
    expect(useStore.getState().cashTransfers).toEqual([transfer()]);
  });

  it('empties a project whose transfers were all removed', async () => {
    useStore.setState({ cashTransfers: [transfer(), other] });
    answers.push({ data: null, error: null });
    await useStore.getState().loadCashTransfersForProject(P);
    expect(useStore.getState().cashTransfers).toEqual([other]);
  });
});

describe('creating a transfer', () => {
  it('inserts the row for the signed-in user, trims the note, prepends the server row and returns its id', async () => {
    useStore.setState({ cashTransfers: [other] });
    answers.push({ data: row({ id: 't-new', amount: '3000', notes: 'عهدة الموقع' }), error: null });

    const id = await useStore.getState().createCashTransfer({
      projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 3000, transferDate: '2026-09-01', notes: '  عهدة الموقع  ',
    });

    expect(id).toBe('t-new');
    expect(calls[0].table).toBe('cash_transfers');
    expect(argOf(0, 'insert')).toEqual({
      project_id: P, from_fund_id: 'f1', to_custody_id: 'c1', amount: 3000, transfer_date: '2026-09-01', notes: 'عهدة الموقع', user_id: 'user-1',
    });
    expect(ops(0).slice(1)).toEqual([['select'], ['single']]);
    expect(useStore.getState().cashTransfers.map((t) => t.id)).toEqual(['t-new', 't-other']);
    expect(useStore.getState().cashTransfers[0]).toMatchObject({ amount: 3000, notes: 'عهدة الموقع' });
  });

  it('stores a blank note as null', async () => {
    answers.push({ data: row(), error: null });
    await useStore.getState().createCashTransfer({ projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 2500, transferDate: '2026-09-01', notes: '   ' });
    expect(argOf(0, 'insert')).toMatchObject({ notes: null });

    answers.push({ data: row(), error: null });
    await useStore.getState().createCashTransfer({ projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 2500, transferDate: '2026-09-01' });
    expect(argOf(1, 'insert')).toMatchObject({ notes: null });
  });

  it('throws the database error without adding a row', async () => {
    answers.push({ data: null, error: new Error('insufficient fund') });
    await expect(useStore.getState().createCashTransfer({ projectId: P, fromFundId: 'f1', toCustodyId: 'c1', amount: 99999, transferDate: '2026-09-01' }))
      .rejects.toThrow('insufficient fund');
    expect(useStore.getState().cashTransfers).toEqual([]);
  });
});

describe('deleting a transfer', () => {
  it('deletes by id and drops only that row', async () => {
    useStore.setState({ cashTransfers: [transfer(), other] });
    answers.push({ error: null });
    await useStore.getState().deleteCashTransfer('t1');
    expect(calls[0].table).toBe('cash_transfers');
    expect(ops(0)).toEqual([['delete'], ['eq', 'id', 't1']]);
    expect(useStore.getState().cashTransfers).toEqual([other]);
  });

  it('keeps the row when the database refuses', async () => {
    useStore.setState({ cashTransfers: [transfer()] });
    answers.push({ error: new Error('locked') });
    await expect(useStore.getState().deleteCashTransfer('t1')).rejects.toThrow('locked');
    expect(useStore.getState().cashTransfers).toEqual([transfer()]);
  });
});

describe('the optimistic removal the repair log uses', () => {
  it('removes a row locally without touching the database and hands it back for the undo', () => {
    useStore.setState({ cashTransfers: [transfer(), other] });
    const removed = useStore.getState().removeCashTransferLocal('t1');
    expect(removed).toEqual(transfer());
    expect(useStore.getState().cashTransfers).toEqual([other]);
    expect(calls).toHaveLength(0);
  });

  it('answers null for an unknown id and changes nothing', () => {
    useStore.setState({ cashTransfers: [transfer()] });
    expect(useStore.getState().removeCashTransferLocal('t-missing')).toBeNull();
    expect(useStore.getState().cashTransfers).toEqual([transfer()]);
  });

  it('restores the removed row at the top, and only once', () => {
    useStore.setState({ cashTransfers: [other] });
    useStore.getState().restoreCashTransferLocal(transfer());
    useStore.getState().restoreCashTransferLocal(transfer());
    expect(useStore.getState().cashTransfers).toEqual([transfer(), other]);
    expect(calls).toHaveLength(0);
  });

  it('leaves the list untouched when a realtime event arrived first', () => {
    useStore.setState({ cashTransfers: [transfer({ amount: 1200 })] });
    useStore.getState().restoreCashTransferLocal(transfer({ amount: 1000 }));
    expect(useStore.getState().cashTransfers).toEqual([transfer({ amount: 1200 })]);
  });
});

describe('realtime edges', () => {
  it('ignores an unknown event, an UPDATE for a row it does not hold, and a DELETE without an id', () => {
    const list = [transfer()];
    expect(applyCashTransferRealtimeEvent(list, { eventType: 'TRUNCATE' })).toBe(list);
    expect(applyCashTransferRealtimeEvent(list, { eventType: 'UPDATE', new: row({ id: 't-elsewhere' }) })).toEqual(list);
    expect(applyCashTransferRealtimeEvent(list, { eventType: 'DELETE', old: {} })).toBe(list);
  });
});
