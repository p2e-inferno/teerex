import { useQuery } from '@tanstack/react-query';
import PublicLockABI from '../../supabase/functions/_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { MAX_RETRIES, calculateRetryDelay, CACHE_TIMES } from '@/lib/config/react-query-config';
import { createReadOnlyContract } from '@/utils/contractHelpers';

async function fetchTotalKeys(lockAddress: string, chainId: number): Promise<number> {
  try {
    // Create contract instance (handles all validation and error cases)
    const lock = await createReadOnlyContract(lockAddress, chainId, PublicLockABI);

    // Fetch total supply
    const totalSupply = await lock.totalSupply();
    return Number(totalSupply);
  } catch (error) {
    // Return 0 for invalid events instead of throwing
    // This prevents one bad event from breaking lists/aggregates
    console.warn(`Failed to fetch total keys for ${lockAddress} on chain ${chainId}:`, error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * Hook to fetch total number of keys (tickets) sold for an event
 * Uses React Query for caching, retries, and automatic refetching
 */
export function useEventTotalKeys(params: { lockAddress: string; chainId: number }) {
  const { lockAddress, chainId } = params;

  return useQuery({
    queryKey: ['event-total-keys', chainId, lockAddress],
    queryFn: () => fetchTotalKeys(lockAddress, chainId),
    enabled: Boolean(lockAddress && lockAddress !== 'Unknown' && chainId),
    staleTime: CACHE_TIMES.EVENT_TOTAL_KEYS.STALE_TIME_MS,
    gcTime: CACHE_TIMES.EVENT_TOTAL_KEYS.GARBAGE_COLLECTION_TIME_MS,
    refetchOnWindowFocus: true, // Refetch when user returns to tab (to show latest sales)
    retry: MAX_RETRIES,
    retryDelay: calculateRetryDelay,
  });
}
