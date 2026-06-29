import { useQuery } from '@tanstack/react-query';
import { getTicketPassBuyerKeyBalance } from '@/utils/ticketPassControllerUtils';

export function useTicketPassBuyerKeyBalance(
  lockAddress: string | undefined,
  buyerAddress: string | undefined,
  chainId: number | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['ticket-pass-buyer-key-balance', lockAddress, buyerAddress?.toLowerCase(), chainId],
    queryFn: async () => {
      if (!lockAddress || !buyerAddress || !chainId) return 0;
      return getTicketPassBuyerKeyBalance(lockAddress, buyerAddress, chainId);
    },
    enabled: (options?.enabled ?? true) && !!lockAddress && !!buyerAddress && !!chainId,
    staleTime: 15 * 1000,
  });
}
