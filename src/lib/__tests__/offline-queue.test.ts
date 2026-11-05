/**
 * Offline queue behaviour.
 * Field expenses must survive a lost connection and replay in order.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The error the next insert answers with, in the shape Supabase returns it: a plain object, not an Error.
const next = vi.hoisted(() => ({ insertError: null as null | { message: string; code?: string; details?: string } }));

vi.mock('@/integrations/supabase/client', () => {
  const calls: { table: string; op: string }[] = [];
  const builder = (table: string) => ({
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert' });
      const error = next.insertError;
      next.insertError = null;
      return Promise.resolve({ data: error ? null : payload, error });
    },
    update: (payload: unknown) => ({
      match: () => {
        calls.push({ table, op: 'update' });
        return Promise.resolve({ data: payload, error: null });
      },
    }),
    delete: () => ({
      match: () => {
        calls.push({ table, op: 'delete' });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  });
  return { supabase: { from: builder, __calls: calls } };
});

import {
  enqueueMutation,
  pendingMutations,
  flushQueue,
  isOffline,
  subscribeToQueueFailures,
} from '../offline-queue';

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

describe('offline-queue', () => {
  beforeEach(() => {
    localStorage.clear();
    setOnline(true);
  });

  it('reports offline only when the browser says so', () => {
    setOnline(false);
    expect(isOffline()).toBe(true);
    setOnline(true);
    expect(isOffline()).toBe(false);
  });

  it('persists queued mutations to localStorage', () => {
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'e1', amount: 100 } });
    const pending = pendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0].table).toBe('expenses');
    expect(pending[0].payload).toMatchObject({ id: 'e1', amount: 100 });
    expect(pending[0].attempts).toBe(0);
  });

  it('keeps insertion order across multiple queued writes', () => {
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'a' } });
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'b' } });
    enqueueMutation({ table: 'expenses', op: 'update', payload: { amount: 1 }, match: { id: 'a' } });
    expect(pendingMutations().map((m) => m.payload?.id ?? m.match?.id)).toEqual(['a', 'b', 'a']);
  });

  it('does not flush while offline', async () => {
    setOnline(false);
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'e1' } });
    const result = await flushQueue();
    expect(result.flushed).toBe(0);
    expect(pendingMutations()).toHaveLength(1);
  });

  it('drains the queue once back online', async () => {
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'e1' } });
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'e2' } });
    const result = await flushQueue();
    expect(result.flushed).toBe(2);
    expect(result.remaining).toBe(0);
    expect(pendingMutations()).toHaveLength(0);
  });

  it('keeps a write when the network drops during replay, though Supabase reports it as a plain object', async () => {
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'e1' } });
    next.insertError = { message: 'TypeError: Failed to fetch', details: 'TypeError: Failed to fetch', code: '' };
    const failures: string[] = [];
    const off = subscribeToQueueFailures((f) => failures.push(f.message));
    const result = await flushQueue();
    off();
    expect(result.flushed).toBe(0);
    expect(pendingMutations()).toHaveLength(1);
    expect(failures).toEqual([]);
  });

  it('counts an insert the server already holds (a timeout that did commit) as done, not failed', async () => {
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'e1' } });
    next.insertError = { message: 'duplicate key value violates unique constraint "expenses_pkey"', code: '23505' };
    const failures: string[] = [];
    const off = subscribeToQueueFailures((f) => failures.push(f.message));
    const result = await flushQueue();
    off();
    expect(result).toEqual({ flushed: 1, remaining: 0 });
    expect(failures).toEqual([]);
  });

  it('drops a write the server refuses for good, and says so with the server\'s words', async () => {
    enqueueMutation({ table: 'expenses', op: 'insert', payload: { id: 'e1' } });
    next.insertError = { message: 'new row violates row-level security policy', code: '42501' };
    const failures: string[] = [];
    const off = subscribeToQueueFailures((f) => failures.push(f.message));
    await flushQueue();
    off();
    expect(pendingMutations()).toHaveLength(0);
    expect(failures).toEqual(['new row violates row-level security policy']);
  });
});
