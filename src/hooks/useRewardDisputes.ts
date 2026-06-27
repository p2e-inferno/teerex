import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { RewardPoolDispute } from '@/types/rewardPool';

/**
 * Disputes for a reward pool. The endpoint is gated to the pool creator or a ticket holder, so the
 * caller must pass `enabled` accordingly (otherwise the request 403s). Reason text / reporter
 * identity are masked server-side per the viewer's relationship to each dispute.
 */
export function useRewardDisputes(
  rewardPoolId?: string | null,
  requesterAddress?: string | null,
  enabled = true,
) {
  const { getAccessToken } = usePrivy();
  const requesterKey = requesterAddress?.toLowerCase() ?? null;
  return useQuery<RewardPoolDispute[]>({
    queryKey: ['reward-disputes', rewardPoolId ?? null, requesterKey],
    enabled: Boolean(rewardPoolId) && enabled,
    queryFn: async () => {
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<{ disputes: RewardPoolDispute[] }>(
        'list-reward-disputes',
        { reward_pool_id: rewardPoolId, requester_address: requesterAddress ?? undefined },
        { privyToken: token },
      );
      return data.disputes ?? [];
    },
  });
}
