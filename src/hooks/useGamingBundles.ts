import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
      const { data, error } = await supabase.functions.invoke('list-gaming-bundles', {
        body: params,
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to load bundles');

      return data.bundles as GamingBundle[];
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}
