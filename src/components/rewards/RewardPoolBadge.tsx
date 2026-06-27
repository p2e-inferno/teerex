import { Badge } from '@/components/ui/badge';
import type { RewardPoolStatus } from '@/types/rewardPool';
import { REWARD_POOL_STATUS_META } from '@/lib/rewards/rewardPoolStatus';

export function RewardPoolBadge({ status }: { status: RewardPoolStatus }) {
  const meta = REWARD_POOL_STATUS_META[status] ?? REWARD_POOL_STATUS_META.funded;
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
