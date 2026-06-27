import { useQuery } from '@tanstack/react-query';
import { getRewardPoolOnchainState } from '@/utils/rewardControllerUtils';
import type { RewardPoolOnchainState } from '@/types/rewardPool';

/**
 * Reads a reward pool directly from TeeRexRewardsControllerV1 so the UI can show a chain-verified
 * trust surface (funded amount, split, claim windows, assigned winners, claimed state) rather than
 * trusting the DB mirror alone.
 */
export function useRewardPoolOnchainState(
  controllerAddress?: string | null,
  poolId?: number | null,
  chainId?: number | null,
) {
  return useQuery<RewardPoolOnchainState | null>({
    queryKey: ['reward-pool-onchain', controllerAddress?.toLowerCase() ?? null, poolId ?? null, chainId ?? null],
    enabled: Boolean(controllerAddress) && poolId != null && Boolean(chainId),
    queryFn: () => getRewardPoolOnchainState(controllerAddress as string, poolId as number, chainId as number),
    staleTime: 15_000,
  });
}
