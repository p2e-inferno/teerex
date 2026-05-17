import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { usePrivy } from '@privy-io/react-auth';
import type { GamingBundle } from '@/types/gaming';

type GamingBundleQuery = {
  mine?: boolean;
  include_inactive?: boolean;
  bundle_type?: string;
  bundle_id?: string;
  bundleId?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export function useGamingBundles(params: GamingBundleQuery = {}, options?: { enabled?: boolean }) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ['gaming-bundles', params],
    queryFn: async () => {
      const token = params.mine ? await getAccessToken?.() : null;
      const data = await callEdgeFunction<any>('list-gaming-bundles', params as Record<string, unknown>, { privyToken: token });
      return data.bundles as GamingBundle[];
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}
