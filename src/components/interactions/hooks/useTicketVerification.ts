import { useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { checkKeyOwnership } from '@/utils/lockUtils';
import { MAX_RETRIES, calculateRetryDelay, CACHE_TIMES } from '@/lib/config/react-query-config';
import type { UseTicketVerificationReturn } from '../types';

/**
 * Hook to verify if the current user has a valid ticket for an event
 * Uses React Query and Unlock Protocol to check key ownership with automatic retries and caching
 */
export const useTicketVerification = (lockAddress: string, chainId: number): UseTicketVerificationReturn => {
  const { wallets } = useWallets();
  const { user } = usePrivy();

  const addresses = useMemo(() => {
    const fromWallets = (wallets || [])
      .map((wallet) => wallet?.address)
      .filter((addr): addr is string => Boolean(addr));
    const embedded = user?.wallet?.address ? [user.wallet.address] : [];
    const all = [...fromWallets, ...embedded].map((addr) => addr.toLowerCase());
    return Array.from(new Set(all));
  }, [wallets, user?.wallet?.address]);

  const {
    data,
    isLoading: isChecking,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ticket-verification', chainId, lockAddress, addresses.join(',')],
    queryFn: async () => {
      const checks = await Promise.all(
        addresses.map((addr) => checkKeyOwnership(lockAddress, addr, chainId))
      );
      const count = checks.filter(Boolean).length;
      return { hasTicket: count > 0, count };
    },
    enabled: Boolean(lockAddress && chainId && addresses.length),
    staleTime: CACHE_TIMES.USER_TICKET_BALANCE.STALE_TIME_MS,
    gcTime: CACHE_TIMES.USER_TICKET_BALANCE.GARBAGE_COLLECTION_TIME_MS,
    refetchOnWindowFocus: false,
    retry: MAX_RETRIES,
    retryDelay: calculateRetryDelay,
  });

  return {
    hasTicket: data?.hasTicket ?? false,
    isChecking,
    ticketCount: data?.count ?? 0,
    error: error as Error | null,
    refetch,
  };
};
