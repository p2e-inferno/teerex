import { useQuery } from '@tanstack/react-query';
import { normalizeWalletAddress } from '@/lib/identity';
import { reverseENS } from '@/utils/ensUtils';

const REVERSE_ENS_STALE_TIME_MS = 24 * 60 * 60 * 1000;
const REVERSE_ENS_GC_TIME_MS = 7 * 24 * 60 * 60 * 1000;

export const reverseEnsQueryKeys = {
  all: ['reverse-ens'] as const,
  byAddress: (address: string | null) => ['reverse-ens', address] as const,
};

export function useReverseENSName(
  address?: string | null,
  options?: { enabled?: boolean },
) {
  const normalizedAddress = normalizeWalletAddress(address);

  const query = useQuery({
    queryKey: reverseEnsQueryKeys.byAddress(normalizedAddress),
    queryFn: () => reverseENS(normalizedAddress!),
    enabled: Boolean(normalizedAddress) && (options?.enabled ?? true),
    staleTime: REVERSE_ENS_STALE_TIME_MS,
    gcTime: REVERSE_ENS_GC_TIME_MS,
    retry: 1,
  });

  return {
    ...query,
    ensName: query.data ?? null,
    normalizedAddress,
    isResolving: query.isLoading || query.isFetching,
  };
}
