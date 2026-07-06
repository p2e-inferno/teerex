export type RewardPoolStatus =
  | 'funded'
  | 'results_pending'
  | 'claiming'
  | 'frozen'
  | 'expired'
  | 'claim_complete'
  | 'closed';

export type RewardDisputeStatus = 'open' | 'under_review' | 'upheld' | 'rejected';
export type RewardDisputeCategory =
  | 'wrong_winner'
  | 'rules_breach'
  | 'collusion'
  | 'not_paid'
  | 'standings'
  | 'other';

export interface RewardPoolPosition {
  reward_pool_id?: string;
  placement: number;
  amount_wei: string;
  winner_address: string | null;
  winner_alias?: string | null;
  assigned_at: string | null;
  hold_until: string | null;
  claimed: boolean;
  reclaimed?: boolean;
  claimed_at: string | null;
  claim_tx_hash?: string | null;
}

export interface RewardPool {
  id: string;
  chain_id: number;
  controller_address: string;
  pool_id: number;
  creator_id?: string;
  creator_address: string;
  event_lock_address: string;
  attendance_controller_address: string | null;
  payout_token_address: string | null;
  payout_token_symbol: string | null;
  token_decimals: number | null;
  total_funded_wei: string;
  claimed_amount_wei: string;
  claim_start: string;
  claim_end: string;
  challenge_window_secs: number;
  frozen_accrued_secs: number;
  position_count: number;
  rules_hash: string;
  rules_uri: string | null;
  status: RewardPoolStatus;
  frozen: boolean;
  tx_hash?: string | null;
  created_at?: string;
  positions: RewardPoolPosition[];
  managers: string[];
}

export interface RewardPoolDispute {
  id: string;
  placement: number | null;
  category: RewardDisputeCategory;
  status: RewardDisputeStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  reason_text: string | null;
  evidence_urls: string[];
  disputer_address: string | null;
}

/** Snapshot read directly from TeeRexRewardsControllerV1 for the trust surface. */
export interface RewardPoolOnchainState {
  exists: boolean;
  frozen: boolean;
  closed: boolean;
  creator: string;
  eventLock: string;
  attendanceController: string | null;
  payoutToken: string | null;
  totalFundedWei: bigint;
  claimedAmountWei: bigint;
  claimStart: number;
  claimEnd: number;
  challengeWindow: number;
  frozenAccrued: number;
  positionCount: number;
  assignedCount: number;
  ticketSupply: bigint | null;
  attendanceCancelInitiated: boolean;
  attendanceRefundComplete: boolean;
  attendanceEarlyExitReady: boolean;
  rulesHash: string;
  positions: RewardPoolOnchainPosition[];
}

export interface RewardPoolOnchainPosition {
  placement: number;
  amountWei: bigint;
  winner: string | null;
  winnerAlias?: string | null;
  assignedAt: number;
  holdUntil: number;
  claimed: boolean;
  reclaimed: boolean;
  claimedAt: number;
  /** Effective time this placement becomes claimable (max of claimStart, window, hold). */
  opensAt: number;
  /** Guaranteed claim end for this placement (>= pool end; extended for a late/held assignment). */
  closesAt: number;
  canClaim: boolean;
}

/** A single placement's prize, expressed as a human-readable amount the UI compiles to wei. */
export interface RewardPositionInput {
  placement: number;
  amount: string;
}

export interface WinnerAssignmentInput {
  account: string;
  placement: number;
}

export interface WinnerAliasUpdate {
  placement: number;
  alias: string | null;
}
