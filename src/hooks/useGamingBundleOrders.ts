import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePrivy } from '@privy-io/react-auth';

export type GamingBundleOrderListItem = {
  id: string;
  bundle_id: string;
  created_at: string;
  status: string;
  fulfillment_method: string;
  payment_provider: string;
  payment_reference: string | null;
  amount_fiat: number | null;
  fiat_symbol: string | null;
  amount_dg: number | null;
  chain_id: number;
  bundle_address: string;
  buyer_address: string | null;
  buyer_display_name: string | null;
  buyer_phone: string | null;
  eas_uid: string | null;
  nft_recipient_address: string | null;
  token_id: string | null;
  txn_hash: string | null;
  redeemed_at: string | null;
  can_reissue: boolean;
  gaming_bundles?: {
    title: string;
    quantity_units: number;
    unit_label: string;
    bundle_type: string;
  } | null;
};

export type GamingBundleOrdersQuery = {
  q?: string;
  bundle_id?: string;
  status?: string;
  payment_provider?: string;
  fulfillment_method?: string;
  limit?: number;
  offset?: number;
};

export function useGamingBundleOrders(params: GamingBundleOrdersQuery = {}, options?: { enabled?: boolean }) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ['gaming-bundle-orders', params],
    queryFn: async () => {
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('list-gaming-bundle-orders', {
        body: params,
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to load bundle orders');

      return data.orders as GamingBundleOrderListItem[];
    },
    enabled: options?.enabled ?? true,
    staleTime: 10 * 1000,
  });
}

