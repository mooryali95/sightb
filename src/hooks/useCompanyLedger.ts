/**
 * The company ledger for one company, through React Query. Writes go
 * through `useLedgerMutation`, which refetches the ledger once they land,
 * so every figure on the page is recomputed from what the database holds.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LedgerNotReady, loadCompanyLedger } from '@/services/companyLedgerService';

export const companyLedgerKey = (companyId: string) => ['company-ledger', companyId] as const;

export function useCompanyLedger(companyId: string | undefined) {
  return useQuery({
    queryKey: companyLedgerKey(companyId ?? 'none'),
    queryFn: () => loadCompanyLedger(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
    // Missing tables will not appear by retrying.
    retry: (count, error) => !(error instanceof LedgerNotReady) && count < 2,
  });
}

export function useLedgerMutation<T, R>(companyId: string, fn: (input: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: companyLedgerKey(companyId) }),
  });
}
