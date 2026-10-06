/**
 * useAppData
 * ---------------------------------------------------------------
 * React Query owns *when* remote data is fetched (dedupe, staleTime,
 * retries, refetch on focus). Zustand keeps owning the normalized
 * client state that components read from.
 *
 * Before this hook every screen fired its own `useEffect(() => loadAll())`,
 * so navigating between routes re-triggered overlapping fetches. Now the
 * query keys below collapse them into one in-flight request.
 */

import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/store/useStore';
import { useAuth } from './useAuth';

export const queryKeys = {
  core: ['app', 'core'] as const,
  details: ['app', 'details'] as const,
  project: (id: string) => ['app', 'project', id] as const,
  company: (id: string) => ['app', 'company', id] as const,
};

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Never saved by the query persister (see `@/lib/query-cache`).
 *
 * These queries return `true`; the data itself lands in the Zustand store as a
 * side effect of the loader. Persisting one saves the `true` and not the
 * store, so after a reload it comes back "successful and fresh", the loader
 * never runs, and every screen renders from an empty store — the project page
 * said "المشروع غير موجود" on any reload within five minutes.
 */
const STORE_LOADER = { noPersist: true } as const;

/** Companies + portfolios + projects — the minimum every screen needs. */
export function useCoreData() {
  const loadAll = useStore((s) => s.loadAll);
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.core,
    queryFn: async () => {
      await loadAll();
      return true;
    },
    enabled: !authLoading && !!user,
    staleTime: FIVE_MINUTES,
    meta: STORE_LOADER,
  });
}

/** Heavy cross-project preload — dashboard-only. */
export function useDetailsData(enabled = true) {
  const loadDetails = useStore((s) => s.loadDetails);
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.details,
    queryFn: async () => {
      await loadDetails();
      return true;
    },
    enabled: enabled && !authLoading && !!user,
    staleTime: FIVE_MINUTES,
    meta: STORE_LOADER,
  });
}

/** Everything scoped to a single project (budget, expenses, funds, payables). */
export function useProjectData(projectId: string | undefined) {
  const loadProjectData = useStore((s) => s.loadProjectData);
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.project(projectId ?? 'none'),
    queryFn: async () => {
      await loadProjectData(projectId as string);
      return true;
    },
    enabled: !!projectId && !authLoading && !!user,
    staleTime: FIVE_MINUTES,
    meta: STORE_LOADER,
  });
}

/** Company indirect costs + every project underneath it. */
export function useCompanyData(companyId: string | undefined) {
  const loadCompanyData = useStore((s) => s.loadCompanyData);
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.company(companyId ?? 'none'),
    queryFn: async () => {
      await loadCompanyData(companyId as string);
      return true;
    },
    enabled: !!companyId && !authLoading && !!user,
    staleTime: FIVE_MINUTES,
    meta: STORE_LOADER,
  });
}
