import { useWallets } from '@privy-io/react-auth';
import { useTicketBalance } from '@/hooks/useTicketBalance';
import type { UseTicketVerificationReturn } from '../types';

/**
 * Hook to verify if the current user has a valid ticket for an event
 * Uses React Query and Unlock Protocol to check key ownership with automatic retries and caching
 */
export const useTicketVerification = (lockAddress: string, chainId: number): UseTicketVerificationReturn => {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];

  const {
    data: ticketCount = 0,
    isLoading: isChecking,
    error,
    refetch
  } = useTicketBalance({
    lockAddress: lockAddress || '',
    userAddress: wallet?.address || '',
    chainId: chainId || 0,
  });

  return {
    hasTicket: ticketCount > 0,
    isChecking,
    ticketCount,
    error: error as Error | null,
    refetch,
  };
};