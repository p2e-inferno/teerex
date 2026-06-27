import { Badge } from '@/components/ui/badge';
import type { RewardPoolStatus } from '@/types/rewardPool';

const STATUS_META: Record<RewardPoolStatus, { label: string; className: string }> = {
  funded: { label: 'Funded', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  results_pending: { label: 'Results pending', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  claiming: { label: 'Claim open', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  frozen: { label: 'Disputed', className: 'bg-red-100 text-red-800 border-red-200' },
  expired: { label: 'Expired', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-500 border-gray-200' },
};

export function RewardPoolBadge({ status }: { status: RewardPoolStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.funded;
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
