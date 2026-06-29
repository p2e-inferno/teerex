import { useQuery } from '@tanstack/react-query';
import { getTicketPassOnchainState } from '@/utils/ticketPassControllerUtils';
import type { TicketPassOnchainState } from '@/types/ticketPass';

/**
 * Reads live on-chain state (remaining copies, closed/issuance flags, redeemed count) for a pass.
 * The contract is the source of truth for availability; the DB status is an eventually-consistent mirror.
 */
export function useTicketPassOnchainState(
  lockAddress: string | undefined,
  controllerAddress: string | undefined,
  chainId: number | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<TicketPassOnchainState | null>({
    queryKey: ['ticket-pass-onchain', lockAddress, chainId],
    queryFn: async () => {
      if (!lockAddress || !controllerAddress || !chainId) return null;
      return getTicketPassOnchainState(lockAddress, controllerAddress, chainId);
    },
    enabled: (options?.enabled ?? true) && !!lockAddress && !!controllerAddress && !!chainId,
    staleTime: 15 * 1000,
  });
}
