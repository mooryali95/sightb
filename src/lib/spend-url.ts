/**
 * spend-url.ts — ترميز/فك ترميز حالة مستكشف الصرف (المستويات + الفلاتر + الفرز)
 * داخل رابط قابل للمشاركة، بحيث يفتح أي جهاز نفس العرض بنفس الأرقام.
 *
 * كل الدوال خالصة ولا تعتمد على المتصفح (تستقبل/تُرجع نصوص query).
 */
import {
  DEFAULT_SPEND_SORT,
  type SpendDimension,
  type SpendFilters,
  type SpendSort,
  type SpendSortDir,
  type SpendSortKey,
} from './expense-analytics';
import type { ExpenseCategory } from '@/types/project';

export interface SpendViewState {
  dimensions: SpendDimension[];
  filters: SpendFilters;
  sort: SpendSort;
}

const VALID_DIMS: SpendDimension[] = ['resource', 'vendor', 'category', 'responsible', 'budgetItem', 'custody'];
const VALID_SORT_KEYS: SpendSortKey[] = ['total', 'count', 'label', 'recent'];

/** يبني نص الـquery (بدون علامة ?) الممثّل للحالة الحالية. */
export function encodeSpendView(state: SpendViewState): string {
  const p = new URLSearchParams();
  p.set('sv', '1');
  if (state.dimensions.length) p.set('dims', state.dimensions.join(','));
  const f = state.filters || {};
  if (f.query) p.set('q', f.query);
  if (f.dateFrom) p.set('from', f.dateFrom);
  if (f.dateTo) p.set('to', f.dateTo);
  if (f.category && f.category !== 'all') p.set('cat', String(f.category));
  if (f.approvalStatus && f.approvalStatus !== 'all') p.set('st', String(f.approvalStatus));
  if (f.groupKey) p.set('gk', f.groupKey);
  const s = state.sort || DEFAULT_SPEND_SORT;
  p.set('sk', s.key);
  p.set('sd', s.dir);
  return p.toString();
}

/** يقرأ الحالة من نص query؛ يُرجع null إن لم يكن الرابط يحمل عرضاً محفوظاً. */
export function decodeSpendView(search: string): SpendViewState | null {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (p.get('sv') !== '1') return null;

  const dims = (p.get('dims') || '')
    .split(',')
    .map((d) => d.trim())
    .filter((d): d is SpendDimension => (VALID_DIMS as string[]).includes(d));

  const key = p.get('sk');
  const dir = p.get('sd');

  return {
    dimensions: dims,
    filters: {
      query: p.get('q') || '',
      dateFrom: p.get('from') || undefined,
      dateTo: p.get('to') || undefined,
      category: (p.get('cat') as ExpenseCategory | null) || 'all',
      approvalStatus: p.get('st') || 'all',
      groupKey: p.get('gk') || undefined,
    },
    sort: {
      key: (VALID_SORT_KEYS as string[]).includes(key || '') ? (key as SpendSortKey) : DEFAULT_SPEND_SORT.key,
      dir: dir === 'asc' || dir === 'desc' ? (dir as SpendSortDir) : DEFAULT_SPEND_SORT.dir,
    },
  };
}

/** رابط كامل قابل للمشاركة يحافظ على مسار الصفحة الحالي. */
/**
 * The view's parameters on top of the page's own tab parameters (`group`
 * and `tab`), so a shared address opens on the tab the explorer lives in
 * rather than on the project summary with the explorer out of sight.
 */
export function withSpendView(search: string, state: SpendViewState): string {
  const page = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const p = new URLSearchParams(encodeSpendView(state));
  for (const key of ['group', 'tab']) {
    const value = page.get(key);
    if (value) p.set(key, value);
  }
  return p.toString();
}

export function buildShareUrl(origin: string, pathname: string, state: SpendViewState, hash = '', search = ''): string {
  return `${origin}${pathname}?${withSpendView(search, state)}${hash}`;
}
