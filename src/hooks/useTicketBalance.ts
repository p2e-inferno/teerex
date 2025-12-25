import { useQuery } from '@tanstack/react-query';
import { isAddress } from 'ethers';
import PublicLockABI from '../../supabase/functions/_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { MAX_RETRIES, calculateRetryDelay, CACHE_TIMES } from '@/lib/config/react-query-config';
import { createReadOnlyContract } from '@/utils/contractHelpers';

async function fetchTicketBalanceForAddresses(
  lockAddress: string,
  userAddresses: string[],
  chainId: number
): Promise<number> {
  // Filter valid addresses
  const validAddresses = userAddresses.filter((addr) => isAddress(addr));
  if (validAddresses.length === 0 || !isAddress(lockAddress)) {
    return 0;
  }

  // Create contract instance (handles all validation and error cases)
  const lock = await createReadOnlyContract(lockAddress, chainId, PublicLockABI);

  // Fetch balances for all addresses and sum them
  const balances = await Promise.all(
    validAddresses.map(async (addr) => {
      try {
        const balance = await lock.balanceOf(addr);
        return Number(balance);
      } catch {
        return 0;
      }
    })
  );

  return balances.reduce((sum, bal) => sum + bal, 0);
}

interface UseTicketBalanceParams {
  lockAddress: string;
  chainId: number;
  /** Single address or array of addresses to check */
  userAddress?: string;
  userAddresses?: string[];
}

export function useTicketBalance(params: UseTicketBalanceParams) {
  const { lockAddress, chainId, userAddress, userAddresses } = params;

  // Support both single address and array of addresses
  const addresses = userAddresses || (userAddress ? [userAddress] : []);
  const addressesKey = addresses.join(',');

  return useQuery({
    queryKey: ['ticket-balance', chainId, lockAddress, addressesKey],
    queryFn: () => fetchTicketBalanceForAddresses(lockAddress, addresses, chainId),
    enabled: Boolean(lockAddress && addresses.length > 0 && chainId),
    staleTime: CACHE_TIMES.USER_TICKET_BALANCE.STALE_TIME_MS,
    gcTime: CACHE_TIMES.USER_TICKET_BALANCE.GARBAGE_COLLECTION_TIME_MS,
    refetchOnWindowFocus: false,
    retry: MAX_RETRIES,
    retryDelay: calculateRetryDelay,
  });
}
