/**
 * The app's query cache, saved to IndexedDB so a reload shows the last
 * figures at once and refreshes them in the background. Owned by one
 * account: wiped on sign-out (the session timeout signs out too) and when a
 * different account signs in; dropped after 24h and on every new build.
 */
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';

export const CACHE_KEY = 'rouya-query-cache';
const OWNER_KEY = 'rouya-query-cache-owner';
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
export const CACHE_BUSTER = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: CACHE_MAX_AGE,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  key: CACHE_KEY,
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  throttleTime: 1000,
});

/**
 * Only settled, successful queries carrying real data are saved.
 *
 * A query whose data is a bare boolean is a store loader: it fetches into
 * Zustand and returns `true`. Saving it saves the flag without the figures,
 * and a reload then skips the fetch and shows an empty app. Those are refused
 * here even if a loader forgets `meta.noPersist`, so the mistake cannot come
 * back with the next loader written the same way.
 */
export function shouldPersistQuery(q: {
  state: { status: string; data?: unknown };
  meta?: Record<string, unknown>;
}): boolean {
  if (q.state.status !== 'success' || q.meta?.noPersist === true) return false;
  return typeof q.state.data !== 'boolean';
}

/** Forget everything cached, in memory and on disk. */
export async function wipeQueryCache(client: QueryClient = queryClient, storage: Storage = localStorage): Promise<void> {
  client.clear();
  storage.removeItem(OWNER_KEY);
  await del(CACHE_KEY).catch(() => undefined);
}

/** Called when the session settles: a different account never sees the last one's cache. */
export async function claimQueryCache(userId: string | null, client: QueryClient = queryClient, storage: Storage = localStorage): Promise<void> {
  if (!userId) { await wipeQueryCache(client, storage); return; }
  const owner = storage.getItem(OWNER_KEY);
  if (owner && owner !== userId) await wipeQueryCache(client, storage);
  storage.setItem(OWNER_KEY, userId);
}
