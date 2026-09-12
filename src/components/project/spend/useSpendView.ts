/**
 * The explorer's view: the grouping levels, the filters and the sort, with
 * the derived filter object the tree builder takes and the two ways a whole
 * view arrives at once (a shared address, a saved template).
 */
import { useMemo, useState } from 'react';
import {
  DEFAULT_SPEND_SORT, type SpendDimension, type SpendFilters, type SpendSort, type SpendSortKey,
} from '@/lib/expense-analytics';
import type { SpendViewState } from '@/lib/spend-url';
import type { ExpenseCategory } from '@/types/project';

export const DEFAULT_PATH: SpendDimension[] = ['resource', 'category', 'budgetItem'];

export function useSpendView() {
  const [levels, setLevels] = useState<SpendDimension[]>(DEFAULT_PATH);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [sort, setSort] = useState<SpendSort>(DEFAULT_SPEND_SORT);

  const filters: SpendFilters = useMemo(
    () => ({
      query,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      category: category as ExpenseCategory | 'all',
      approvalStatus: status,
    }),
    [query, dateFrom, dateTo, category, status],
  );
  const hasFilters = !!(query || dateFrom || dateTo || category !== 'all' || status !== 'all');
  const state: SpendViewState = useMemo(() => ({ dimensions: levels, filters, sort }), [levels, filters, sort]);

  const resetFilters = () => {
    setQuery(''); setDateFrom(''); setDateTo(''); setCategory('all'); setStatus('all');
  };

  /** A whole view at once: from a shared address or a saved template. */
  const applyView = (view: SpendViewState) => {
    setLevels(view.dimensions?.length ? view.dimensions : DEFAULT_PATH);
    setQuery(view.filters.query || '');
    setDateFrom(view.filters.dateFrom || '');
    setDateTo(view.filters.dateTo || '');
    setCategory((view.filters.category as string) || 'all');
    setStatus((view.filters.approvalStatus as string) || 'all');
    setSort(view.sort || DEFAULT_SPEND_SORT);
  };

  /** Sets one grouping level; 'none' cuts the path there, and a dimension used later moves up. */
  const setLevel = (index: number, dim: SpendDimension | 'none') => {
    setLevels((prev) => {
      const next = [...prev];
      if (dim === 'none') return next.slice(0, index);
      next[index] = dim;
      return next.slice(0, index + 1).concat(prev.slice(index + 1).filter((d) => d !== dim));
    });
  };

  const setSortKey = (key: SpendSortKey) => setSort((s) => ({ ...s, key }));
  const flipSortDir = () => setSort((s) => ({ ...s, dir: s.dir === 'desc' ? 'asc' : 'desc' }));

  return {
    levels, query, dateFrom, dateTo, category, status, sort, filters, hasFilters, state,
    setQuery, setDateFrom, setDateTo, setCategory, setStatus, setLevel, setSortKey, flipSortDir,
    resetFilters, applyView,
  };
}

export type SpendView = ReturnType<typeof useSpendView>;
