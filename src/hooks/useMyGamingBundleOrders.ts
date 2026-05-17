import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export type MyGamingBundleOrderListItem = {
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
  buyer_email: string | null;
  buyer_display_name: string | null;
  buyer_phone: string | null;
  eas_uid: string | null;
  nft_recipient_address: string | null;
  token_id: string | null;
  txn_hash: string | null;
  gaming_bundles?: {
    title: string;
    bundle_type: string;
    quantity_units: number;
    unit_label: string;
    image_url: string | null;
    location: string | null;
  } | null;
};

export type MyGamingBundleOrdersQuery = {
  status?: string;
  limit?: number;
  offset?: number;
};

export function useMyGamingBundleOrders(params: MyGamingBundleOrdersQuery = {}, options?: { enabled?: boolean }) {
  const { getAccessToken } = usePrivy();

  return useQuery({
    queryKey: ['my-gaming-bundle-orders', params],
    queryFn: async () => {
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<any>('list-my-gaming-bundle-orders', params as Record<string, unknown>, { privyToken: token });
      return data.orders as MyGamingBundleOrderListItem[];
    },
    enabled: options?.enabled ?? true,
    staleTime: 10 * 1000,
  });
}

