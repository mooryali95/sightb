import { describe, it, expect } from 'vitest';
import { encodeSpendView, decodeSpendView, withSpendView, buildShareUrl } from '../spend-url';

const view = { dimensions: ['resource', 'category'] as const, filters: { query: 'فندق', approvalStatus: 'all' as const }, sort: { key: 'total' as const, dir: 'desc' as const } };

describe('the shared spend view address', () => {
  it('round-trips the view through the query string', () => {
    const decoded = decodeSpendView(`?${encodeSpendView({ ...view, dimensions: [...view.dimensions] })}`);
    expect(decoded?.dimensions).toEqual(['resource', 'category']);
    expect(decoded?.filters.query).toBe('فندق');
    expect(decoded?.sort).toEqual({ key: 'total', dir: 'desc' });
  });

  it('keeps the page\'s tab parameters, so the link opens where the explorer is', () => {
    const qs = new URLSearchParams(withSpendView('?group=finance&tab=expenses&stale=1', { ...view, dimensions: [...view.dimensions] }));
    expect(qs.get('group')).toBe('finance');
    expect(qs.get('tab')).toBe('expenses');
    expect(qs.get('sv')).toBe('1');
    expect(qs.get('q')).toBe('فندق');
    // Nothing else of the page's address rides along.
    expect(qs.get('stale')).toBeNull();
  });

  it('builds the full address with the tab parameters and the hash', () => {
    const url = buildShareUrl('https://app.test', '/project/p1', { ...view, dimensions: [...view.dimensions] }, '#top', '?group=finance&tab=expenses');
    expect(url.startsWith('https://app.test/project/p1?')).toBe(true);
    expect(url).toContain('group=finance');
    expect(url).toContain('tab=expenses');
    expect(url.endsWith('#top')).toBe(true);
  });
});
