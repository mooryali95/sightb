/**
 * The database wrapper is the only thing that talks to the client, and what
 * it promises is reliability: a transient failure is retried with backoff,
 * a real error comes back at once, and a write flagged for offline use is
 * queued instead of lost. Each promise is exercised against a scripted
 * client; the backoff runs on fake timers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, unwrap } from '@/services/db';
import { enqueueMutation, isOffline } from '@/lib/offline-queue';

type Scripted = { data?: unknown; error?: unknown } | Error;
const script: Scripted[] = [];
const calls: { table: string; chain: string[] }[] = [];

/** A builder that records the chain and resolves the next scripted result when awaited. */
function builder(table: string) {
  const chain: string[] = [];
  const self: Record<string, unknown> = {};
  const record = { table, chain };
  calls.push(record);
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'order', 'limit', 'single', 'maybeSingle'];
  for (const m of methods) {
    self[m] = (...args: unknown[]) => { chain.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')})`); return self; };
  }
  self.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    const next = script.shift();
    if (next instanceof Error) reject(next); else resolve(next ?? { data: [], error: null });
  };
  return self;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: (fn: string) => builder(`rpc:${fn}`),
    functions: { invoke: vi.fn() },
    storage: {},
    auth: { getUser: vi.fn(), signOut: vi.fn() },
  },
}));
vi.mock('@/lib/offline-queue', () => ({ enqueueMutation: vi.fn(), isOffline: vi.fn(() => false) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), capture: vi.fn(), info: vi.fn() } }));

const transient = { message: 'Failed to fetch' };
const forbidden = { message: 'permission denied', code: '42501' };

beforeEach(() => {
  script.length = 0; calls.length = 0;
  vi.mocked(enqueueMutation).mockClear();
  vi.mocked(isOffline).mockReturnValue(false);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

/** Awaits a chain while the fake clock runs the backoff. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  const guarded = p.finally(() => { done = true; });
  // A rejection is the caller's to observe; keep the loop from reporting it first.
  guarded.catch(() => undefined);
  while (!done) await vi.advanceTimersByTimeAsync(1000);
  return guarded;
}

describe('db.from', () => {
  it('replays the recorded chain on the client and returns its result', async () => {
    script.push({ data: [{ id: '1' }], error: null });
    const result = await settle(db.from('expenses').select('*').eq('id', '1').single());
    expect(result).toEqual({ data: [{ id: '1' }], error: null });
    expect(calls[0]).toEqual({ table: 'expenses', chain: ['select("*")', 'eq("id","1")', 'single()'] });
  });

  it('retries a transient failure with backoff and returns the first success', async () => {
    script.push({ data: null, error: transient }, new Error('NetworkError when attempting to fetch'), { data: [{ id: '2' }], error: null });
    const result = await settle(db.from('expenses').select('*'));
    expect(result).toEqual({ data: [{ id: '2' }], error: null });
    // Three builds: the two that failed and the one that answered.
    expect(calls).toHaveLength(3);
  });

  it('gives up after three attempts and returns the last error rather than throwing', async () => {
    script.push({ data: null, error: transient }, { data: null, error: { message: 'timeout' } }, { data: null, error: { message: 'x', status: 503 } });
    const result = await settle(db.from('expenses').select('*'));
    expect(result).toEqual({ data: null, error: { message: 'x', status: 503 } });
    expect(calls).toHaveLength(3);
  });

  it('returns a real error at once, without a retry', async () => {
    script.push({ data: null, error: forbidden });
    const result = await settle(db.from('expenses').insert({ a: 1 }));
    expect(result).toEqual({ data: null, error: forbidden });
    expect(calls).toHaveLength(1);
  });

  it('rethrows a thrown non-transient error', async () => {
    script.push(new Error('boom'));
    await expect(settle(db.from('expenses').select('*'))).rejects.toThrow('boom');
    expect(calls).toHaveLength(1);
  });

  it('queues an offline-flagged write when the device is offline, without touching the client', async () => {
    vi.mocked(isOffline).mockReturnValue(true);
    const result = await settle(db.from('expenses', { offline: true }).insert({ id: 'e-1', amount: 5 }).select());
    expect(result).toEqual({ data: [{ id: 'e-1', amount: 5 }], error: null, queuedOffline: true });
    expect(enqueueMutation).toHaveBeenCalledWith({ table: 'expenses', op: 'insert', payload: { id: 'e-1', amount: 5 }, match: {} });
    expect(calls).toHaveLength(0);
  });

  it('queues an offline-flagged update with its match when the network keeps failing', async () => {
    script.push({ data: null, error: transient }, { data: null, error: transient }, { data: null, error: transient });
    const result = await settle(db.from('expenses', { offline: true }).update({ amount: 9 }).eq('id', 'e-1'));
    expect(result).toMatchObject({ queuedOffline: true });
    expect(enqueueMutation).toHaveBeenCalledWith({ table: 'expenses', op: 'update', payload: { amount: 9 }, match: { id: 'e-1' } });
  });

  it('never queues a read, or a write not flagged for offline use', async () => {
    vi.mocked(isOffline).mockReturnValue(true);
    script.push({ data: [], error: null }, { data: null, error: forbidden });
    await settle(db.from('expenses', { offline: true }).select('*'));
    await settle(db.from('expenses').insert({ a: 1 }));
    expect(enqueueMutation).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
  });
});

describe('db.rpc', () => {
  it('retries a transient RPC failure', async () => {
    script.push({ data: null, error: { message: 'fetch failed' } }, { data: { ok: true }, error: null });
    const result = await settle(db.rpc('recompute'));
    expect(result).toEqual({ data: { ok: true }, error: null });
    expect(calls.map((c) => c.table)).toEqual(['rpc:recompute', 'rpc:recompute']);
  });
});

describe('unwrap', () => {
  it('returns the data, and throws a normalized Error carrying the client message', () => {
    expect(unwrap({ data: [1], error: null }, 'x')).toEqual([1]);
    expect(() => unwrap({ data: null, error: { message: 'row level security' } }, 'تحميل')).toThrow('row level security');
    const err = new Error('already an error');
    expect(() => unwrap({ data: null, error: err }, 'x')).toThrow(err);
  });
});
