/**
 * useSsotHealth
 * ---------------------------------------------------------------
 * تحقق تلقائي عند فتح المشروع: يجلب ملخص الخادم مرة واحدة (React Query
 * يمنع التكرار بين الشارة واللوحة)، ويقارنه بأرقام الواجهة.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchProjectFinancialSummary, type ServerProjectSummary } from '@/services/projectSummaryService';
import { buildReconciliation, type SsotFigure, type SsotKey, type SsotReconRow } from '@/lib/ssot-report';

export function useSsotSummary(projectId?: string) {
  return useQuery<ServerProjectSummary>({
    queryKey: ['ssot-summary', projectId],
    queryFn: () => fetchProjectFinancialSummary(projectId as string),
    enabled: !!projectId,
    staleTime: 60_000,
    retry: 1,
  });
}

export interface SsotHealth {
  loading: boolean;
  error: string | null;
  computedAt: string | null;
  rows: SsotReconRow[];
  mismatches: SsotReconRow[];
  server: ServerProjectSummary | undefined;
  refetch: () => void;
}

export function useSsotHealth(
  projectId: string | undefined,
  audit: Record<SsotKey, SsotFigure> | null,
): SsotHealth {
  const { data, isLoading, error, refetch } = useSsotSummary(projectId);

  const rows = data && audit
    ? buildReconciliation(data as unknown as Record<string, number>, audit)
    : [];

  return {
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'تعذّر جلب الملخص من الخادم.') : null,
    computedAt: data?.computedAt ?? null,
    rows,
    mismatches: rows.filter((r) => r.mismatch),
    server: data,
    refetch: () => { void refetch(); },
  };
}
