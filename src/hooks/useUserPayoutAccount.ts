import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export interface UserPayoutAccount {
  id: string;
  provider: string;
  account_holder_name: string;
  bank_code: string;
  bank_name: string;
  account_number?: string;
  account_number_last4: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const userPayoutAccountQueryKey = ['user-payout-account', 'paystack'];

export function useUserPayoutAccount() {
  const { getAccessToken, authenticated } = usePrivy();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: userPayoutAccountQueryKey,
    enabled: authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('get-user-payout-account', {}, {
        privyToken: token,
        withAnonKey: true,
        method: 'GET',
      });
      return (data.payout_account || null) as UserPayoutAccount | null;
    },
    staleTime: 60 * 1000,
  });

  return {
    ...query,
    payoutAccount: query.data ?? null,
    refreshPayoutAccount: () => queryClient.invalidateQueries({ queryKey: userPayoutAccountQueryKey }),
  };
}
