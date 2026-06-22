import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export interface VendorPayoutAccountResult {
  payout_account: {
    percentage_charge?: number | null;
    status?: string;
    has_subaccount?: boolean;
  } | null;
  can_receive_fiat_payments: boolean;
}

/**
 * The authenticated user's fiat payout-account status. Used to hard-gate any "create for fiat sale"
 * flow (ticket passes, gaming bundles) so a seller can never list before they can receive Naira.
 */
export function useVendorPayoutAccount(options?: { enabled?: boolean }) {
  const { getAccessToken, authenticated } = usePrivy();

  return useQuery({
    queryKey: ['vendor-payout-account'],
    queryFn: async () => {
      const token = await getAccessToken?.();
      return callEdgeFunction<VendorPayoutAccountResult>(
        'get-vendor-payout-account',
        {},
        { privyToken: token, withAnonKey: true, method: 'GET' },
      );
    },
    enabled: (options?.enabled ?? true) && authenticated,
    staleTime: 60 * 1000,
  });
}
