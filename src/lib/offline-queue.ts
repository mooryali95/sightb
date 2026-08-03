/**
 * Offline mutation queue.
 * ---------------------------------------------------------------
 * Field users (site expenses) frequently lose connectivity. Writes
 * flagged `offline: true` in the data-access layer are persisted to
 * localStorage when the network is unavailable and replayed — in
 * order — as soon as the browser reports `online`.
 *
 * Rows are queued WITH a client-generated `id`, so the optimistic UI
 * row and the eventual server row share the same primary key.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

const STORAGE_KEY = 'rouya.offline-queue.v1';

export interface QueuedMutation {
  id: string;
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  match?: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
}

type Listener = (items: QueuedMutation[]) => void;
const listeners = new Set<Listener>();
let flushing = false;

function read(): QueuedMutation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedMutation[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota — drop silently, queue is best-effort */
  }
  listeners.forEach((l) => l(items));
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function pendingMutations(): QueuedMutation[] {
  return read();
}

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(read());
  return () => listeners.delete(listener);
}

export function enqueueMutation(
  entry: Omit<QueuedMutation, 'id' | 'queuedAt' | 'attempts'>
): QueuedMutation {
  const item: QueuedMutation = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  write([...read(), item]);
  logger.warn('offline-queue', `تم تأجيل ${entry.op} على ${entry.table} حتى عودة الاتصال`, {
    table: entry.table,
  });
  return item;
}

async function apply(item: QueuedMutation): Promise<void> {
  const table = (supabase as any).from(item.table);
  if (item.op === 'insert') {
    const { error } = await table.insert(item.payload);
    if (error) throw error;
    return;
  }
  let query = item.op === 'update' ? table.update(item.payload) : table.delete();
  for (const [k, v] of Object.entries(item.match ?? {})) query = query.eq(k, v);
  const { error } = await query;
  if (error) throw error;
}

/** Replays every queued mutation in order. Stops at the first network failure. */
export async function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushing || isOffline()) return { flushed: 0, remaining: read().length };
  flushing = true;
  let flushed = 0;
  try {
    let items = read();
    while (items.length > 0) {
      const [head, ...rest] = items;
      try {
        await apply(head);
        flushed += 1;
        items = rest;
        write(items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isNetwork = /fetch|network|Failed to fetch/i.test(message);
        if (isNetwork) {
          logger.warn('offline-queue', 'ما زال الاتصال منقطعاً — سيُعاد المحاولة لاحقاً');
          break;
        }
        // Permanent failure (validation / RLS): drop it so the queue never jams.
        logger.error('offline-queue', `فشل نهائي في ${head.op} على ${head.table}: ${message}`);
        items = rest;
        write(items);
      }
    }
    if (flushed > 0) logger.info('offline-queue', `تمت مزامنة ${flushed} عملية مؤجلة`);
    return { flushed, remaining: read().length };
  } finally {
    flushing = false;
  }
}

/** Wires automatic flushing on reconnect (called once from main.tsx). */
export function installOfflineQueue() {
  if (typeof window === 'undefined') return;
  if ((window as any).__rouyaOfflineQueueInstalled) return;
  (window as any).__rouyaOfflineQueueInstalled = true;
  window.addEventListener('online', () => {
    void flushQueue();
  });
  if (!isOffline()) void flushQueue();
}
