import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { usePrivy } from '@privy-io/react-auth';
import type { TicketPass } from '@/types/ticketPass';

type TicketPassQuery = {
  mine?: boolean;
  chain_id?: number;
  status?: string;
  target_event_address?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export function useTicketPasses(params: TicketPassQuery = {}, options?: { enabled?: boolean }) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ['ticket-passes', params],
    queryFn: async () => {
      const token = params.mine ? await getAccessToken?.() : null;
      const data = await callEdgeFunction<{ passes: TicketPass[] }>(
        'list-ticket-passes',
        params as Record<string, unknown>,
        { privyToken: token },
      );
      return data.passes;
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useTicketPass(idOrLock: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['ticket-pass', idOrLock],
    queryFn: async () => {
      const isAddr = !!idOrLock && /^0x[a-fA-F0-9]{40}$/.test(idOrLock);
      const data = await callEdgeFunction<{ pass: TicketPass }>(
        'get-ticket-pass',
        isAddr ? { lock_address: idOrLock } : { id: idOrLock },
        {},
      );
      return data.pass;
    },
    enabled: (options?.enabled ?? true) && !!idOrLock,
    staleTime: 30 * 1000,
  });
}
