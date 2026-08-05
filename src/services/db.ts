/**
 * Resilient data-access layer (the ONLY place that talks to the DB client).
 * ---------------------------------------------------------------
 * Every service builds its queries through `db.from(...)`. The chain is
 * recorded lazily and re-executed on each attempt, which gives us:
 *
 *   • exponential backoff retry on transient network / 5xx failures
 *   • one central place for error normalization + logging
 *   • an offline queue hook for writes flagged `{ offline: true }`
 *
 * Store slices must NOT import `@/integrations/supabase/client` directly —
 * they consume services, services consume this module.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { enqueueMutation, isOffline } from '@/lib/offline-queue';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

const WRITE_OPS = new Set(['insert', 'update', 'delete', 'upsert']);

interface ChainCall {
  method: string;
  args: unknown[];
}

export interface DbOptions {
  /** Queue the write locally when the device is offline instead of throwing. */
  offline?: boolean;
}

function isTransient(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as { message?: string; code?: string; status?: number };
  const message = anyErr.message ?? String(error);
  if (/Failed to fetch|NetworkError|network|timeout|ECONNRESET|fetch failed/i.test(message)) return true;
  if (typeof anyErr.status === 'number' && anyErr.status >= 500) return true;
  // Postgres serialization / deadlock
  return anyErr.code === '40001' || anyErr.code === '40P01';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function execute(build: () => any, label: string): Promise<any> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await build();
      if (result?.error && isTransient(result.error)) {
        lastError = result.error;
      } else {
        return result;
      }
    } catch (err) {
      if (!isTransient(err)) throw err;
      lastError = err;
    }
    if (attempt < MAX_ATTEMPTS) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 100;
      logger.warn('db', `إعادة محاولة ${label} (${attempt}/${MAX_ATTEMPTS - 1})`, { delay });
      await sleep(delay);
    }
  }
  logger.capture('db', lastError, { label });
  return { data: null, error: lastError };
}

function buildFrom(table: string, calls: ChainCall[]): any {
  let query: any = (supabase as any).from(table);
  for (const call of calls) query = query[call.method](...call.args);
  return query;
}

function offlineIntent(table: string, calls: ChainCall[]) {
  const op = calls.find((c) => WRITE_OPS.has(c.method));
  if (!op || op.method === 'upsert') return null;
  const match: Record<string, unknown> = {};
  for (const call of calls) {
    if (call.method === 'eq') match[String(call.args[0])] = call.args[1];
  }
  return {
    table,
    op: op.method as 'insert' | 'update' | 'delete',
    payload: op.method === 'delete' ? undefined : (op.args[0] as Record<string, unknown>),
    match,
  };
}

function chain(table: string, calls: ChainCall[], options: DbOptions): any {
  const label = `${table}.${calls.map((c) => c.method).join('.') || 'select'}`;

  const run = async () => {
    if (options.offline && isOffline()) {
      const intent = offlineIntent(table, calls);
      if (intent) {
        enqueueMutation(intent);
        return { data: intent.payload ? [intent.payload] : null, error: null, queuedOffline: true };
      }
    }
    const result = await execute(() => buildFrom(table, calls), label);
    if (result?.error && options.offline && isTransient(result.error)) {
      const intent = offlineIntent(table, calls);
      if (intent) {
        enqueueMutation(intent);
        return { data: intent.payload ? [intent.payload] : null, error: null, queuedOffline: true };
      }
    }
    return result;
  };

  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (prop === 'then') {
          return (resolve: any, reject: any) => run().then(resolve, reject);
        }
        if (prop === 'catch') return (reject: any) => run().catch(reject);
        if (prop === 'finally') return (fn: any) => run().finally(fn);
        return (...args: unknown[]) => chain(table, [...calls, { method: String(prop), args }], options);
      },
    }
  );
}

export const db = {
  /** Lazily-built, retry-aware table query. Mirrors the supabase builder API. */
  from(table: string, options: DbOptions = {}) {
    return chain(table, [], options);
  },

  /** Retry-aware RPC call. */
  async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: unknown }> {
    return execute(() => (supabase as any).rpc(fn, args), `rpc.${fn}`);
  },

  /** Retry-aware edge function invocation. */
  async invoke<T = unknown>(fn: string, body?: unknown): Promise<{ data: T | null; error: unknown }> {
    return execute(
      () => supabase.functions.invoke(fn, body == null ? undefined : { body: body as Record<string, unknown> }),
      `fn.${fn}`
    );
  },

  /** Storage handle — binary I/O, not routed through the query retry chain. */
  storage: supabase.storage,

  /** Ends the current session. */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },


  /** Current authenticated user id (throws when signed out). */
  async userId(): Promise<string> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('Not authenticated');
    return data.user.id;
  },

  /** Escape hatch for realtime channels / storage — never for CRUD. */
  raw: supabase,
};

/** Throws normalized errors from a `{ data, error }` envelope. */
export function unwrap<T>(result: { data: T | null; error: unknown }, context: string): T {
  if (result.error) {
    const message = result.error instanceof Error ? result.error.message : (result.error as any)?.message ?? String(result.error);
    logger.error('db', `${context}: ${message}`);
    throw result.error instanceof Error ? result.error : new Error(message);
  }
  return result.data as T;
}
