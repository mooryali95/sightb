import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useDashboardFilters } from '../useDashboardFilters';

function setup(at = '/') {
  return renderHook(() => ({ f: useDashboardFilters(), loc: useLocation() }), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>,
  });
}

describe('useDashboardFilters', () => {
  it('reads a shared link and ignores an unknown period', () => {
    const { result } = setup('/?company=c1&portfolio=pf1&period=decade&inactive=1&q=%D8%A7%D9%84%D8%A3%D9%81%D9%82');
    expect(result.current.f.filters).toEqual({
      filterCompany: 'c1', filterPortfolio: 'pf1', filterStatus: 'all', searchQuery: 'الأفق', timePeriod: 'all', showInactive: true,
    });
  });

  it('keeps both of two updates made in one event', () => {
    const { result } = setup();
    act(() => {
      result.current.f.update({ filterStatus: 'completed' });
      result.current.f.update({ showInactive: true });
    });
    expect(result.current.f.filters).toMatchObject({ filterStatus: 'completed', showInactive: true });
    expect(result.current.loc.search).toBe('?status=completed&inactive=1');
  });

  it('clears the portfolio when the company changes, and leaves defaults out of the link', () => {
    const { result } = setup('/?company=c1&portfolio=pf1');
    act(() => result.current.f.update({ filterCompany: 'c2' }));
    expect(result.current.loc.search).toBe('?company=c2');
    act(() => result.current.f.clear());
    expect(result.current.loc.search).toBe('');
    expect(result.current.f.active).toEqual([]);
  });
});
