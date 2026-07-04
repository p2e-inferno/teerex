import type { RewardDisputeCategory } from '@/types/rewardPool';

export const REWARD_DISPUTE_CATEGORY_LABELS: Record<RewardDisputeCategory, string> = {
  wrong_winner: 'Wrong winner',
  rules_breach: 'Rules breach',
  collusion: 'Suspected collusion',
  not_paid: "Couldn't claim",
  standings: 'Standings / ranking issue',
  other: 'Other',
};

export const REWARD_DISPUTE_CATEGORY_OPTIONS: Array<{ value: RewardDisputeCategory; label: string }> = [
  { value: 'wrong_winner', label: 'Wrong winner declared' },
  { value: 'rules_breach', label: 'Organizer broke the stated rules' },
  { value: 'collusion', label: 'Suspected collusion' },
  { value: 'not_paid', label: "Won but couldn't claim" },
  { value: 'standings', label: REWARD_DISPUTE_CATEGORY_LABELS.standings },
  { value: 'other', label: REWARD_DISPUTE_CATEGORY_LABELS.other },
];

export const REWARD_POOL_DISPUTE_CATEGORY_OPTIONS = REWARD_DISPUTE_CATEGORY_OPTIONS.filter(
  (option) => option.value !== 'standings',
);
