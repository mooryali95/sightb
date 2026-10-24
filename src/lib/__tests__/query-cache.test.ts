import { describe, it, expect, vi } from 'vitest';
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn(() => Promise.resolve()) }));
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { claimQueryCache, shouldPersistQuery } from '../query-cache';
import { pageForPath } from '../route-preload';

const seeded = () => { const c = new QueryClient(); c.setQueryData(['core'], { a: 1 }); return c; };

describe('saved query cache', () => {
  it('is wiped on sign-out', async () => {
    const c = seeded();
    await claimQueryCache(null, c, localStorage);
    expect(c.getQueryData(['core'])).toBeUndefined();
  });
  it('is kept for the same account and wiped for another', async () => {
    localStorage.clear();
    const c = seeded();
    await claimQueryCache('u1', c, localStorage);
    expect(c.getQueryData(['core'])).toEqual({ a: 1 });
    await claimQueryCache('u2', c, localStorage);
    expect(c.getQueryData(['core'])).toBeUndefined();
  });
  it('saves only successful queries not marked noPersist', () => {
    expect(shouldPersistQuery({ state: { status: 'success' } })).toBe(true);
    expect(shouldPersistQuery({ state: { status: 'error' } })).toBe(false);
    expect(shouldPersistQuery({ state: { status: 'success' }, meta: { noPersist: true } })).toBe(false);
  });
  it('refuses a store loader, whose data is the flag `true` and not the figures', () => {
    // Saving one restores "fresh" on reload, the loader never runs, and every
    // screen renders from an empty store: "المشروع غير موجود" on any reload.
    expect(shouldPersistQuery({ state: { status: 'success', data: true } })).toBe(false);
    expect(shouldPersistQuery({ state: { status: 'success', data: { a: 1 } } })).toBe(true);
  });
  it('leaves store loaders out of what the persister actually writes', async () => {
    const c = new QueryClient();
    await c.fetchQuery({ queryKey: ['app', 'core'], queryFn: async () => true });
    await c.fetchQuery({ queryKey: ['real'], queryFn: async () => ({ rows: 3 }) });
    const saved = dehydrate(c, { shouldDehydrateQuery: shouldPersistQuery }).queries.map((q) => q.queryKey);
    expect(saved).toEqual([['real']]);
  });
  it('maps paths to pages', () => {
    expect(pageForPath('/project/abc')).toBe('project');
    expect(pageForPath('/project/new')).toBe('newProject');
    expect(pageForPath('/')).toBe('dashboard');
  });
});
