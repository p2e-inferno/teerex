import { useRewardDisputes } from '@/hooks/useRewardDisputes';
import { REWARD_DISPUTE_CATEGORY_LABELS } from '@/lib/rewards/disputeCategories';
import type { RewardDisputeStatus } from '@/types/rewardPool';

const STATUS_META: Record<RewardDisputeStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-amber-100 text-amber-800' },
  under_review: { label: 'Under review', className: 'bg-blue-100 text-blue-800' },
  upheld: { label: 'Upheld', className: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', className: 'bg-gray-100 text-gray-600' },
};

interface Props {
  rewardPoolId: string;
  requesterAddress?: string | null;
  enabled: boolean;
}

export function RewardDisputesList({ rewardPoolId, requesterAddress, enabled }: Props) {
  const { data: disputes = [], isLoading } = useRewardDisputes(rewardPoolId, requesterAddress, enabled);

  if (!enabled || isLoading || disputes.length === 0) return null;

  return (
    <div>
      <div className="font-medium mb-1">Disputes</div>
      <div className="space-y-2">
        {disputes.map((d) => {
          const status = STATUS_META[d.status] ?? STATUS_META.open;
          return (
            <div key={d.id} className="rounded-md border p-2 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {REWARD_DISPUTE_CATEGORY_LABELS[d.category] ?? d.category}
                  {d.placement ? ` · #${d.placement}` : ''}
                </span>
                <span className={`rounded px-1.5 py-0.5 ${status.className}`}>{status.label}</span>
              </div>
              {d.reason_text && <p className="text-muted-foreground">{d.reason_text}</p>}
              {d.resolution_note && <p className="text-emerald-700">Resolution: {d.resolution_note}</p>}
              <p className="text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
