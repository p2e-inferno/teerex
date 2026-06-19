import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { usePrivy } from '@privy-io/react-auth';
import type { TicketPassOrder } from '@/types/ticketPass';

export function useMyTicketPassOrders(options?: { enabled?: boolean }) {
  const { getAccessToken, authenticated } = usePrivy();

  return useQuery({
    queryKey: ['my-ticket-pass-orders'],
    queryFn: async () => {
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<{ orders: TicketPassOrder[] }>(
        'list-my-ticket-pass-orders',
        {},
        { privyToken: token },
      );
      return data.orders;
    },
    enabled: (options?.enabled ?? true) && authenticated,
    staleTime: 15 * 1000,
  });
}
