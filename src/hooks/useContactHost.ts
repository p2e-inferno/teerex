import { useMutation } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export function useContactHost() {
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: async ({ eventId, message }: { eventId: string; message: string }) => {
      const token = await getAccessToken();
      return callEdgeFunction('contact-host', { event_id: eventId, message }, { privyToken: token });
    },
  });
}
