import { describe, it, expect, vi } from 'vitest';
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn(() => Promise.resolve()) }));
import { QueryClient } from '@tanstack/react-query';
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
  it('maps paths to pages', () => {
    expect(pageForPath('/project/abc')).toBe('project');
    expect(pageForPath('/project/new')).toBe('newProject');
    expect(pageForPath('/')).toBe('dashboard');
  });
});
