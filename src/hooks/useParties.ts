/** The company's registry entries for pickers, through React Query; refreshed when the ledger changes. */
import { useQuery } from '@tanstack/react-query';
import { listParties } from '@/services/registryService';

export const partiesKey = (companyId: string) => ['parties', companyId] as const;

export function useParties(companyId: string | undefined) {
  return useQuery({
    queryKey: partiesKey(companyId ?? 'none'),
    queryFn: () => listParties(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
  });
}
