import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { RewardPool } from '@/types/rewardPool';

/**
 * Reward pools attached to an event, read from the Supabase mirror (public terms + declared
 * winners). Dispute reason text is NOT returned here — see useRewardDisputes.
 */
export function useRewardPools(eventLockAddress?: string | null, chainId?: number) {
  return useQuery<RewardPool[]>({
    queryKey: ['reward-pools', eventLockAddress?.toLowerCase() ?? null, chainId ?? null],
    enabled: Boolean(eventLockAddress),
    queryFn: async () => {
      const data = await callEdgeFunction<{ pools: RewardPool[] }>(
        'list-event-reward-pools',
        { event_lock_address: eventLockAddress, chain_id: chainId },
        {},
      );
      return data.pools ?? [];
    },
  });
}
