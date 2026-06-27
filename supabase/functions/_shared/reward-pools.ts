/* deno-lint-ignore-file no-explicit-any */
import { ethers } from "https://esm.sh/ethers@6.14.4";
import RewardsControllerAbi from "./abi/TeeRexRewardsControllerV1.json" assert { type: "json" };

// Shared on-chain reads + status derivation for TeeRexRewardsControllerV1, used by both the
// create-reward-pool (verify-then-mirror) and sync-reward-pool (reconcile) edge functions so the
// mirror logic lives in exactly one place. The chain is the source of truth; the DB follows.

const ZERO = "0x0000000000000000000000000000000000000000";

export type RewardPoolStatus =
  | "funded"
  | "results_pending"
  | "claiming"
  | "frozen"
  | "expired"
  | "claim_complete"
  | "closed";

export interface OnchainRewardPool {
  exists: boolean;
  frozen: boolean;
  closed: boolean;
  creator: string;
  eventLock: string;
  attendanceController: string | null;
  payoutToken: string | null;
  totalFundedWei: string;
  claimedAmountWei: string;
  claimStart: number; // epoch seconds
  claimEnd: number;
  challengeWindow: number;
  frozenAccrued: number;
  positionCount: number;
  assignedCount: number;
  rulesHash: string;
}

export interface OnchainPosition {
  placement: number;
  amountWei: string;
  winner: string | null;
  assignedAt: number; // epoch seconds (0 = unassigned)
  holdUntil: number;
  claimed: boolean;
  reclaimed: boolean;
  claimedAt: number;
}

export function getRewardsController(address: string, provider: ethers.Provider): ethers.Contract {
  return new ethers.Contract(address, RewardsControllerAbi as any, provider);
}

export async function readRewardPool(
  controller: ethers.Contract,
  poolId: number | bigint,
): Promise<OnchainRewardPool> {
  const p = await controller.getPool(poolId);
  const attendance = String(p.attendanceController).toLowerCase();
  const token = String(p.payoutToken).toLowerCase();
  return {
    exists: Boolean(p.exists),
    frozen: Boolean(p.frozen),
    closed: Boolean(p.closed),
    creator: String(p.creator).toLowerCase(),
    eventLock: String(p.eventLock).toLowerCase(),
    attendanceController: attendance === ZERO ? null : attendance,
    payoutToken: token === ZERO ? null : token,
    totalFundedWei: p.totalFunded.toString(),
    claimedAmountWei: p.claimedAmount.toString(),
    claimStart: Number(p.claimStart),
    claimEnd: Number(p.claimEnd),
    challengeWindow: Number(p.challengeWindow),
    frozenAccrued: Number(p.frozenAccrued),
    positionCount: Number(p.positionCount),
    assignedCount: Number(p.assignedCount),
    rulesHash: String(p.rulesHash),
  };
}

export async function readRewardPositions(
  controller: ethers.Contract,
  poolId: number | bigint,
  positionCount: number,
): Promise<OnchainPosition[]> {
  const out: OnchainPosition[] = [];
  for (let placement = 1; placement <= positionCount; placement++) {
    const pos = await controller.positions(poolId, placement);
    const winner = String(pos.winner).toLowerCase();
    out.push({
      placement,
      amountWei: pos.amount.toString(),
      winner: winner === ZERO ? null : winner,
      assignedAt: Number(pos.assignedAt),
      holdUntil: Number(pos.holdUntil),
      claimed: Boolean(pos.claimed),
      reclaimed: Boolean(pos.reclaimed),
      claimedAt: Number(pos.claimedAt),
    });
  }
  return out;
}

export function deriveRewardPoolStatus(pool: OnchainRewardPool, nowSecs: number): RewardPoolStatus {
  // `closed` is creator-driven (closePool or a reclaim that settled the last share). A pool whose
  // escrow is fully drained while still open got there only via winner claims — a reclaim that
  // fully settles a pool always sets `closed` — so this is the distinct "all winners paid" terminal.
  if (pool.closed) return "closed";
  if (BigInt(pool.claimedAmountWei) >= BigInt(pool.totalFundedWei)) return "claim_complete";
  if (pool.frozen) return "frozen";
  if (nowSecs > pool.claimEnd + pool.frozenAccrued) return "expired";
  if (pool.assignedCount === 0) return "funded";
  if (nowSecs >= pool.claimStart) return "claiming";
  return "results_pending";
}

export function epochToIso(epoch: number): string | null {
  if (!epoch || epoch <= 0) return null;
  return new Date(epoch * 1000).toISOString();
}
