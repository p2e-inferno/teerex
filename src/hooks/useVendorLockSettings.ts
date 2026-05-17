import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export interface VendorLockSettings {
  id: string;
  lock_address: string;
  chain_id: number;
  lock_name: string;
  lock_symbol: string | null;
  key_price_wei: string;
  key_price_display: number;
  currency: string;
  currency_address: string;
  expiration_duration_seconds: number | null;
  max_keys_per_address: number;
  is_transferable: boolean;
  description: string | null;
  image_url: string | null;
  benefits: string[];
}

/**
 * Hook to fetch active vendor lock settings
 * Used by "Become a Vendor" page and vendor access checks
 *
 * @returns Query result with vendor lock settings or null if not configured
 */
export function useVendorLockSettings() {
  return useQuery({
    queryKey: ['vendor-lock-settings'],
    queryFn: async (): Promise<VendorLockSettings | null> => {
      const data = await callEdgeFunction<any>('get-vendor-lock-settings', {}, {});
      return data.settings;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
