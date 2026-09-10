/**
 * A chainable stand-in for `@/services/db`.
 *
 * `fundSlice` talks to the database directly rather than through a service
 * module, so unlike the payables slice there is no narrow function surface to
 * stub. What it does use is one shape — `db.from(table).<op>(payload).eq(...)`
 * ending either in `.single()` or in being awaited — so this records that shape
 * instead of guessing at it.
 *
 * Two things it deliberately does NOT do:
 *
 *   - it does not validate the query. A mock that accepts anything cannot prove
 *     a query is correct, so the tests assert on the recorded calls instead of
 *     trusting the mock to reject a wrong one.
 *   - it does not echo the payload back as `data` by default. Returning the
 *     input as the output would let a mapper that drops a field still look
 *     right, so every test that reads state back states its row explicitly.
 */
import { vi } from 'vitest';

export interface DbCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

export type DbResponder = (call: DbCall) => { data?: unknown; error?: unknown };

export function makeDbMock() {
  const calls: DbCall[] = [];
  /** Per `${table}:${op}` responders; the last one queued wins for that key. */
  const responders = new Map<string, DbResponder>();

  function respond(call: DbCall) {
    const fn = responders.get(`${call.table}:${call.op}`);
    return fn ? { data: null, error: null, ...fn(call) } : { data: null, error: null };
  }

  function chain(call: DbCall) {
    const node: Record<string, unknown> = {
      select: (..._a: unknown[]) => { if (!call.op) call.op = 'select'; return node; },
      eq: (col: string, val: unknown) => { call.filters.push([col, val]); return node; },
      order: () => node,
      limit: () => node,
      single: () => Promise.resolve(respond(call)),
      // Awaiting the chain without `.single()` runs it too.
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(respond(call)).then(res, rej),
    };
    return node;
  }

  const db = {
    from: vi.fn((table: string) => {
      const base: DbCall = { table, op: 'select', filters: [] };
      return {
        select: (..._a: unknown[]) => { calls.push(base); return chain(base); },
        insert: (payload: unknown) => {
          const c: DbCall = { table, op: 'insert', payload, filters: [] };
          calls.push(c); return chain(c);
        },
        update: (payload: unknown) => {
          const c: DbCall = { table, op: 'update', payload, filters: [] };
          calls.push(c); return chain(c);
        },
        delete: () => {
          const c: DbCall = { table, op: 'delete', filters: [] };
          calls.push(c); return chain(c);
        },
      };
    }),
    userId: vi.fn().mockResolvedValue('user-1'),
  };

  return {
    db,
    calls,
    /** Queue the result for one `${table}:${op}` pair. */
    on(table: string, op: DbCall['op'], fn: DbResponder) {
      responders.set(`${table}:${op}`, fn);
    },
    reset() {
      calls.length = 0;
      responders.clear();
      db.from.mockClear();
    },
    /** Calls in the order they were issued, as `table:op` — for ordering assertions. */
    order(): string[] {
      return calls.map((c) => `${c.table}:${c.op}`);
    },
    find(table: string, op: DbCall['op']): DbCall | undefined {
      return calls.find((c) => c.table === table && c.op === op);
    },
  };
}
