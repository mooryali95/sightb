/**
 * The dashboard's filters, kept in the address bar so a filtered view can
 * be bookmarked, shared, and survives a reload or the back button. Default
 * values are left out of the URL, so the plain dashboard stays at "/".
 */
import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DashboardFilters } from '@/pages/dashboard/dashboardFigures';

const KEYS = { filterCompany: 'company', filterPortfolio: 'portfolio', filterStatus: 'status', searchQuery: 'q', timePeriod: 'period', showInactive: 'inactive' } as const;
const PERIODS = ['all', 'month', 'quarter', 'year'];

export type FullFilters = Required<DashboardFilters>;
export const DEFAULT_FILTERS: FullFilters = {
  filterCompany: 'all', filterPortfolio: 'all', filterStatus: 'all', searchQuery: '', timePeriod: 'all', showInactive: false,
};

export function readFilters(params: URLSearchParams): FullFilters {
  const period = params.get(KEYS.timePeriod) ?? 'all';
  return {
    filterCompany: params.get(KEYS.filterCompany) || 'all',
    filterPortfolio: params.get(KEYS.filterPortfolio) || 'all',
    filterStatus: params.get(KEYS.filterStatus) || 'all',
    searchQuery: params.get(KEYS.searchQuery) ?? '',
    timePeriod: PERIODS.includes(period) ? period : 'all',
    showInactive: params.get(KEYS.showInactive) === '1',
  };
}

export function useDashboardFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  // Two updates in one event (a finished status also turns on the finished
  // projects) must both land. React Router does not chain functional updates
  // made in the same tick, so the latest filters are kept here, synchronously.
  const latest = useRef(filters);
  latest.current = filters;

  const update = useCallback((patch: Partial<FullFilters>) => {
    const next = { ...latest.current, ...patch };
    // A portfolio belongs to one company; changing the company clears it.
    if (patch.filterCompany !== undefined && patch.filterPortfolio === undefined) next.filterPortfolio = 'all';
    latest.current = next;
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      for (const [field, key] of Object.entries(KEYS) as [keyof FullFilters, string][]) {
        const value = next[field];
        const isDefault = value === DEFAULT_FILTERS[field];
        if (isDefault) out.delete(key);
        else out.set(key, typeof value === 'boolean' ? '1' : String(value));
      }
      return out;
    }, { replace: true });
  }, [setParams]);

  const clear = useCallback(() => update(DEFAULT_FILTERS), [update]);
  const active = (Object.keys(DEFAULT_FILTERS) as (keyof FullFilters)[]).filter((k) => filters[k] !== DEFAULT_FILTERS[k]);
  return { filters, update, clear, active };
}
