/**
 * Offline queue behaviour.
 * Field expenses must survive a lost connection and replay in order.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const calls: { table: string; op: string }[] = [];
  const builder = (table: string) => ({
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert' });
      return Promise.resolve({ data: payload, error: null });
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
});
