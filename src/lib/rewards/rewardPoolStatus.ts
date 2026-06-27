import type { RewardPool, RewardPoolStatus } from '@/types/rewardPool';

export const REWARD_POOL_STATUS_META: Record<RewardPoolStatus, { label: string; className: string }> = {
  funded: { label: 'Funded', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  results_pending: { label: 'Results pending', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  claiming: { label: 'Claim open', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  frozen: { label: 'Disputed', className: 'bg-red-100 text-red-800 border-red-200' },
  expired: { label: 'Expired', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const EVENT_REWARD_POOL_STATUS_META: Record<RewardPoolStatus, { label: string; className: string }> = {
  funded: {
    label: 'Prize funded',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  results_pending: {
    label: 'Results pending',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  claiming: {
    label: 'Claim open',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  frozen: {
    label: 'Prize disputed',
    className: 'bg-red-50 text-red-800 border-red-200',
  },
  expired: {
    label: 'Claim ended',
    className: 'bg-gray-50 text-gray-700 border-gray-200',
  },
  closed: {
    label: 'Prize closed',
    className: 'bg-gray-50 text-gray-500 border-gray-200',
  },
};

const EVENT_STATUS_PRIORITY: Record<RewardPoolStatus, number> = {
  frozen: 0,
  claiming: 1,
  results_pending: 2,
  funded: 3,
  expired: 4,
  closed: 5,
};

export function getEventRewardPoolBadgeMeta(pools: RewardPool[]) {
  if (!pools.length) return null;

  const status = pools
    .map((pool) => pool.status)
    .sort((a, b) => EVENT_STATUS_PRIORITY[a] - EVENT_STATUS_PRIORITY[b])[0];

  return EVENT_REWARD_POOL_STATUS_META[status] ?? EVENT_REWARD_POOL_STATUS_META.funded;
}
