import { useQuery } from '@tanstack/react-query';
import PublicLockABI from '../../supabase/functions/_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { MAX_RETRIES, calculateRetryDelay, CACHE_TIMES } from '@/lib/config/react-query-config';
import { createReadOnlyContract, validateAddresses } from '@/utils/contractHelpers';

async function fetchTicketBalance(lockAddress: string, userAddress: string, chainId: number): Promise<number> {
  // Validate addresses
  validateAddresses(lockAddress, userAddress);

  // Create contract instance (handles all validation and error cases)
  const lock = await createReadOnlyContract(lockAddress, chainId, PublicLockABI);

  // Fetch balance
  const balance = await lock.balanceOf(userAddress);
  return Number(balance);
}

export function useTicketBalance(params: { lockAddress: string; userAddress: string; chainId: number }) {
  const { lockAddress, userAddress, chainId } = params;

  return useQuery({
    queryKey: ['ticket-balance', chainId, lockAddress, userAddress],
    queryFn: () => fetchTicketBalance(lockAddress, userAddress, chainId),
    enabled: Boolean(lockAddress && userAddress && chainId),
    staleTime: CACHE_TIMES.USER_TICKET_BALANCE.STALE_TIME_MS,
    gcTime: CACHE_TIMES.USER_TICKET_BALANCE.GARBAGE_COLLECTION_TIME_MS,
    refetchOnWindowFocus: false,
    retry: MAX_RETRIES,
    retryDelay: calculateRetryDelay,
  });
}
