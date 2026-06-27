import { ethers } from 'ethers';
import { getNetworkConfigByChainId, getRpcUrl } from '@/lib/config/network-config';
import { getRewardsControllerAddress } from '@/lib/config/contract-config';
import { ensureCorrectNetwork } from '@/utils/lockUtils';
import { getRawEip1193Provider } from '@/lib/wallet/provider';
import { REWARDS_CONTROLLER_V1_ABI } from '@/lib/abi/teerex-rewards-controller-v1';
import type {
  RewardPoolOnchainState,
  RewardPoolOnchainPosition,
  WinnerAssignmentInput,
} from '@/types/rewardPool';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const REWARD_POOL_DEBUG = true;

// Sourced from the compiled Foundry artifact so function selectors, struct field order, and custom
// error fragments always match the deployed contract — a hand-maintained ABI drifting from the
// struct order is a silent estimation-revert risk.
export const REWARDS_CONTROLLER_ABI = REWARDS_CONTROLLER_V1_ABI;

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

const PUBLIC_LOCK_ABI = [
  'function totalSupply() view returns (uint256)',
];

const ATTENDANCE_CONTROLLER_ABI = [
  'function eventConfigByLock(address lock) view returns (bool exists, bool managerReleased, bool cancelInitiated, bool refundComplete)',
];

const REWARD_ERROR_MESSAGES: Record<string, string> = {
  NotLockManager: 'Only an event lock manager can create a reward pool for this event.',
  TokenNotAllowed: 'That payout token is not on the allowlist.',
  AttendanceNotAllowed: 'That attendance controller is not recognised.',
  EventNotProtected: 'The selected event is not registered with that attendance controller.',
  BadPositions: 'Invalid prize amounts — each placement must be greater than zero.',
  BadFunding: 'The funded amount does not match the total prize.',
  BadWindow: 'Invalid claim window. Check the start, end, and challenge window.',
  TooManyPositions: 'Too many placements for a single pool.',
  BatchTooLarge: 'Too many winners in one transaction — assign in smaller batches.',
  NotCreator: 'Only the pool creator can perform this action.',
  NotManager: 'Only the creator or a reward manager can assign winners.',
  PoolIsFrozen: 'This reward pool is frozen pending dispute review.',
  PoolIsClosed: 'This reward pool is closed.',
  BadPlacement: 'Invalid placement.',
  NotTicketHolder: 'That address does not hold a ticket for this event.',
  AlreadyAssigned: 'That address is already assigned to a placement.',
  AlreadyClaimed: 'This placement has already been claimed.',
  CannotReplaceAfterClaimStart: 'Winners can no longer be replaced once the claim window has opened.',
  WindowNotOpen: 'The claim window is not open yet.',
  WindowClosed: 'The claim window has closed.',
  NotWinner: 'This prize is not assigned to your wallet.',
  EarlyExitNotAllowed: 'This prize pool cannot be cancelled yet. It can only return prize funds before winners are declared, and only when no tickets exist or the protected event was cancelled and ticket refunds are complete.',
  NotYetReclaimable: 'Funds can only be reclaimed after the claim window ends.',
  NothingToPay: 'There is nothing left to reclaim.',
  NativeTransferFailed: 'The native transfer failed.',
  UnexpectedNativeValue: 'Do not send ETH when funding a token-denominated pool.',
  InvalidEventLock: 'That event lock address is not a recognised event contract.',
  InvalidRecipient: 'Invalid recipient address.',
  InvalidToken: 'That token is not valid for this action.',
  InvalidArbitrator: 'Invalid arbitrator address.',
  NotArbitrator: 'Only the arbitrator can perform this action.',
  NotAssigned: 'No winner is assigned to that placement.',
  NotFrozen: 'This pool is not frozen.',
  UnknownPool: 'That prize pool does not exist.',
  SafeERC20FailedOperation: 'The token transfer failed. Check your balance and approval, then retry.',
  OwnableUnauthorizedAccount: 'Only the contract owner can perform this action.',
};

// Validations the contract runs before it ever pulls the ERC20 escrow. If a pre-approval funding
// simulation reverts with any of these, it is a genuine blocker; any other revert at that point is
// just the un-approved transferFrom failing, which the approve step will resolve.
const PRE_FUNDING_VALIDATION_REVERTS = new Set([
  'NotLockManager',
  'InvalidEventLock',
  'AttendanceNotAllowed',
  'EventNotProtected',
  'TokenNotAllowed',
  'BadPositions',
  'TooManyPositions',
  'BadWindow',
  'UnexpectedNativeValue',
]);

function decodeRewardError(err: any, fallback: string): string {
  const code = err?.code ?? err?.error?.code;
  const name: string | undefined = err?.revert?.name;
  const revertMessage = Array.isArray(err?.revert?.args) ? String(err.revert.args[0] ?? '') : '';
  if (name === 'Error' && revertMessage) {
    if (revertMessage.toLowerCase().includes('transfer amount exceeds balance')) {
      return 'Insufficient token balance for the prize escrow. Lower the prize total or add more funds to this wallet.';
    }
    return revertMessage;
  }
  if (name) return REWARD_ERROR_MESSAGES[name] ?? name;
  const msg = String(err?.shortMessage || err?.reason || (err instanceof Error ? err.message : '') || '');
  const lower = msg.toLowerCase();
  if (code === 4001 || code === 'ACTION_REJECTED' || lower.includes('user rejected') || lower.includes('user denied')) {
    return 'Transaction was cancelled. Please try again when ready.';
  }
  if (lower.includes('insufficient funds')) {
    return 'Insufficient funds for the prize escrow and network fees.';
  }
  if (lower.includes('transfer amount exceeds balance')) {
    return 'Insufficient token balance for the prize escrow. Lower the prize total or add more funds to this wallet.';
  }
  if (
    code === -32603 ||
    lower.includes('could not coalesce error') ||
    lower.includes('missing revert data') ||
    lower.includes('execution reverted')
  ) {
    return 'The wallet could not complete this transaction. Check your network, gas, and permissions.';
  }
  return msg || fallback;
}

export interface RewardActionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export interface CreateRewardPoolConfig {
  eventLockAddress: string;
  attendanceControllerAddress?: string | null;
  payoutTokenAddress?: string | null; // null = native ETH
  positionAmountsWei: bigint[];
  claimStart: number; // epoch seconds
  claimEnd: number;
  challengeWindowSecs: number;
  rulesHash: string; // bytes32
  initialManagers?: string[];
  expectedManagerAddress?: string | null; // event creator wallet, for a precise switch-wallet hint
}

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface CreateRewardPoolResult extends RewardActionResult {
  poolId?: number;
  controllerAddress?: string;
  totalFundedWei?: string;
}

async function getReadProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
  const networkConfig = await getNetworkConfigByChainId(chainId);
  let rpcUrl = networkConfig?.rpc_url || undefined;
  if (!rpcUrl) {
    try { rpcUrl = getRpcUrl(chainId); } catch { rpcUrl = undefined; }
  }
  if (!rpcUrl) throw new Error(`No RPC URL configured for chain ID ${chainId}`);
  return new ethers.JsonRpcProvider(rpcUrl);
}

async function getControllerWithSigner(controllerAddress: string, wallet: any, chainId: number) {
  if (!wallet?.address) throw new Error('No wallet provided. Please connect your wallet first.');
  if (!ethers.isAddress(controllerAddress)) throw new Error('Invalid rewards controller address.');
  const provider = await getRawEip1193Provider(wallet);
  await ensureCorrectNetwork(provider, chainId);
  const signer = await new ethers.BrowserProvider(provider).getSigner();
  return new ethers.Contract(controllerAddress, REWARDS_CONTROLLER_ABI, signer);
}

const TX_CONFIRMATIONS = 1;

function debugRewardPool(label: string, details?: Record<string, unknown>) {
  if (!REWARD_POOL_DEBUG) return;
  console.debug(`[reward-pool-debug][temporary] ${label}`, details ?? {});
}

function summarizeRewardError(err: any): Record<string, unknown> {
  return {
    name: err?.name,
    code: err?.code ?? err?.error?.code,
    action: err?.action,
    reason: err?.reason,
    shortMessage: err?.shortMessage,
    message: err instanceof Error ? err.message : err?.message,
    revert: err?.revert,
    data: err?.data ?? err?.error?.data,
    info: err?.info,
    transaction: err?.transaction
      ? {
          to: err.transaction.to,
          from: err.transaction.from,
          data: err.transaction.data,
          value: err.transaction.value?.toString?.() ?? err.transaction.value,
        }
      : undefined,
  };
}

function debugRewardPoolError(label: string, err: unknown, details?: Record<string, unknown>) {
  if (!REWARD_POOL_DEBUG) return;
  console.error(`[reward-pool-debug][temporary] ${label}`, {
    ...details,
    errorSummary: summarizeRewardError(err),
  }, err);
}

// A broadcast tx hash is not success: the tx can mine with a status-0 (reverted) receipt. Every
// on-chain step must wait for the receipt and assert status before it is treated as done.
async function confirmTx(
  tx: ethers.ContractTransactionResponse,
  failMessage: string,
): Promise<ethers.ContractTransactionReceipt> {
  const receipt = await tx.wait(TX_CONFIRMATIONS);
  if (!receipt || receipt.status !== 1) throw new Error(failMessage);
  return receipt;
}

interface PreparedRewardPool {
  controllerAddress: string;
  payoutToken: string;
  isEth: boolean;
  total: bigint;
  params: {
    eventLock: string;
    attendanceController: string;
    payoutToken: string;
    positionAmounts: bigint[];
    claimStart: number;
    claimEnd: number;
    challengeWindow: number;
    rulesHash: string;
    initialManagers: string[];
  };
}

async function prepareRewardPool(config: CreateRewardPoolConfig, chainId: number): Promise<PreparedRewardPool> {
  if (!config.positionAmountsWei.length) throw new Error('At least one prize placement is required.');
  const controllerAddress = await getRewardsControllerAddress(chainId);
  const payoutToken = config.payoutTokenAddress || ZERO_ADDRESS;
  const total = config.positionAmountsWei.reduce((a, b) => a + b, 0n);
  return {
    controllerAddress,
    payoutToken,
    isEth: payoutToken === ZERO_ADDRESS,
    total,
    params: {
      eventLock: config.eventLockAddress,
      attendanceController: config.attendanceControllerAddress || ZERO_ADDRESS,
      payoutToken,
      positionAmounts: config.positionAmountsWei,
      claimStart: config.claimStart,
      claimEnd: config.claimEnd,
      challengeWindow: config.challengeWindowSecs,
      rulesHash: config.rulesHash,
      initialManagers: config.initialManagers ?? [],
    },
  };
}

/**
 * Simulate createRewardPool before any wallet prompt so a guaranteed revert (wrong lock manager,
 * unallowlisted attendance controller, bad window) surfaces its named reason up front instead of
 * failing silently at gas estimation after the user has already approved. All contract validations
 * run before the ERC20 transferFrom, so an allowance-shaped static revert just means the checks
 * passed and approval is still pending — that case is allowed through.
 */
export async function preflightCreateRewardPool(
  config: CreateRewardPoolConfig,
  wallet: any,
  chainId: number,
): Promise<void> {
  if (!wallet?.address) throw new Error('No wallet provided. Please connect your wallet first.');
  const { controllerAddress, payoutToken, isEth, total, params } = await prepareRewardPool(config, chainId);

  debugRewardPool('preflight:start', {
    chainId,
    walletAddress: wallet.address,
    expectedManagerAddress: config.expectedManagerAddress,
    controllerAddress,
    eventLockAddress: config.eventLockAddress,
    attendanceControllerAddress: config.attendanceControllerAddress ?? null,
    payoutToken,
    isEth,
    totalWei: total.toString(),
    positionAmountsWei: config.positionAmountsWei.map((amount) => amount.toString()),
    claimStart: config.claimStart,
    claimEnd: config.claimEnd,
    challengeWindowSecs: config.challengeWindowSecs,
    rulesHash: config.rulesHash,
    initialManagers: config.initialManagers ?? [],
    params: {
      ...params,
      positionAmounts: params.positionAmounts.map((amount) => amount.toString()),
    },
  });

  const provider = await getRawEip1193Provider(wallet);
  await ensureCorrectNetwork(provider, chainId);
  const signer = await new ethers.BrowserProvider(provider).getSigner();
  const signerAddress = await signer.getAddress();
  const controller = new ethers.Contract(controllerAddress, REWARDS_CONTROLLER_ABI, signer);

  debugRewardPool('preflight:signer-ready', {
    chainId,
    walletAddress: wallet.address,
    signerAddress,
    controllerAddress,
  });

  let needsApprove = false;
  if (!isEth) {
    const allowed: boolean = await controller.isAllowedPayoutToken(payoutToken).catch((err: unknown) => {
      debugRewardPoolError('preflight:allowed-token-read-failed', err, { payoutToken, controllerAddress });
      return false;
    });
    debugRewardPool('preflight:payout-token-allowlist', {
      payoutToken,
      controllerAddress,
      allowed,
    });
    if (!allowed) throw new Error('This prize token is not on the allowlist for this network yet.');
    const token = new ethers.Contract(payoutToken, ERC20_ABI, signer);
    const [allowance, balance]: [bigint, bigint] = await Promise.all([
      token.allowance(signerAddress, controllerAddress),
      token.balanceOf(signerAddress),
    ]);
    needsApprove = allowance < total;
    debugRewardPool('preflight:erc20-allowance', {
      payoutToken,
      signerAddress,
      controllerAddress,
      balanceWei: balance.toString(),
      allowanceWei: allowance.toString(),
      totalWei: total.toString(),
      needsApprove,
    });
    if (balance < total) {
      throw new Error('Insufficient token balance for the prize escrow. Lower the prize total or add more funds to this wallet.');
    }
  }

  try {
    await controller.createRewardPool.staticCall(params, isEth ? { value: total } : {});
    debugRewardPool('preflight:static-call-success', {
      controllerAddress,
      signerAddress,
      isEth,
      totalWei: total.toString(),
    });
  } catch (err: any) {
    const name: string | undefined = err?.revert?.name;
    debugRewardPoolError('preflight:static-call-failed', err, {
      controllerAddress,
      signerAddress,
      revertName: name,
      needsApprove,
      isPreFundingValidationRevert: Boolean(name && PRE_FUNDING_VALIDATION_REVERTS.has(name)),
      decodedMessage: decodeRewardError(err, 'This prize pool cannot be funded as configured.'),
    });
    // Before approval the simulated transferFrom reverts for lack of allowance; only a named
    // pre-funding validation error means the pool itself is misconfigured.
    if (needsApprove && !(name && PRE_FUNDING_VALIDATION_REVERTS.has(name))) {
      debugRewardPool('preflight:static-call-failure-treated-as-approval-needed', {
        controllerAddress,
        signerAddress,
        revertName: name,
      });
      return;
    }
    // Creator auth is anchored to lock-manager status of the active wallet — name it and point the
    // user at the wallet that created the event rather than the opaque NotLockManager reason.
    if (name === 'NotLockManager') {
      const expected = config.expectedManagerAddress && ethers.isAddress(config.expectedManagerAddress)
        ? ` Switch your wallet to ${shortAddr(config.expectedManagerAddress)}, the wallet that created this event.`
        : ' Switch to the wallet that created this event.';
      throw new Error(`Connected wallet ${shortAddr(signerAddress)} is not a manager of this event's lock.${expected}`);
    }
    throw new Error(decodeRewardError(err, 'This prize pool cannot be funded as configured.'));
  }
}

/** Approve the controller to pull the ERC20 escrow. No-op for ETH or when allowance already covers it. */
export async function approveRewardPoolFunding(
  config: CreateRewardPoolConfig,
  wallet: any,
  chainId: number,
): Promise<{ approved: boolean }> {
  const { controllerAddress, payoutToken, isEth, total } = await prepareRewardPool(config, chainId);
  if (isEth) return { approved: false };

  const provider = await getRawEip1193Provider(wallet);
  await ensureCorrectNetwork(provider, chainId);
  const signer = await new ethers.BrowserProvider(provider).getSigner();
  const signerAddress = await signer.getAddress();
  const token = new ethers.Contract(payoutToken, ERC20_ABI, signer);
  const allowance: bigint = await token.allowance(signerAddress, controllerAddress);
  if (allowance >= total) return { approved: false };

  try {
    await confirmTx(await token.approve(controllerAddress, total), 'Token approval failed.');
  } catch (error: any) {
    if (String(error?.message || '').toLowerCase().includes('must be zero')) {
      await confirmTx(await token.approve(controllerAddress, 0), 'Token approval reset failed.');
      await confirmTx(await token.approve(controllerAddress, total), 'Token approval failed.');
    } else {
      throw new Error(decodeRewardError(error, 'Token approval failed.'));
    }
  }
  return { approved: true };
}

/** Send the on-chain createRewardPool funding transaction and read back the new pool id. */
export async function fundRewardPool(
  config: CreateRewardPoolConfig,
  wallet: any,
  chainId: number,
): Promise<CreateRewardPoolResult> {
  if (!wallet?.address) throw new Error('No wallet provided. Please connect your wallet first.');
  const { controllerAddress, isEth, total, params } = await prepareRewardPool(config, chainId);

  const provider = await getRawEip1193Provider(wallet);
  await ensureCorrectNetwork(provider, chainId);
  const signer = await new ethers.BrowserProvider(provider).getSigner();
  const controller = new ethers.Contract(controllerAddress, REWARDS_CONTROLLER_ABI, signer);

  let tx: ethers.ContractTransactionResponse;
  try {
    tx = await controller.createRewardPool(params, isEth ? { value: total } : {});
  } catch (error) {
    throw new Error(decodeRewardError(error, 'Failed to fund the prize pool.'));
  }
  const receipt = await confirmTx(tx, 'Prize pool funding transaction failed.');

  let poolId: number | undefined;
  const iface = new ethers.Interface(REWARDS_CONTROLLER_ABI);
  for (const log of receipt.logs || []) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === 'PoolCreated') {
        poolId = Number(parsed.args.poolId);
        break;
      }
    } catch {
      // ignore logs from other contracts
    }
  }
  if (poolId == null) {
    throw new Error('Prize pool was funded, but the pool ID could not be read. Check your wallet history before retrying.');
  }

  return {
    success: true,
    transactionHash: tx.hash,
    poolId,
    controllerAddress,
    totalFundedWei: total.toString(),
  };
}

async function runPoolTx(
  controllerAddress: string,
  wallet: any,
  chainId: number,
  call: (c: ethers.Contract) => Promise<any>,
  failMessage: string,
): Promise<RewardActionResult> {
  try {
    const controller = await getControllerWithSigner(controllerAddress, wallet, chainId);
    const tx = await call(controller);
    await confirmTx(tx, failMessage);
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: decodeRewardError(error, failMessage) };
  }
}

export const assignWinners = (
  controllerAddress: string, poolId: number, batch: WinnerAssignmentInput[], wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId,
  (c) => c.assignWinners(poolId, batch.map((b) => ({ account: b.account, placement: b.placement }))),
  'Failed to assign winners');

export const claimReward = (
  controllerAddress: string, poolId: number, placement: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.claim(poolId, placement), 'Failed to claim prize');

export const raiseRewardDispute = (
  controllerAddress: string, poolId: number, placement: number, reasonHash: string, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.raiseDispute(poolId, placement, reasonHash), 'Failed to raise dispute');

export const addRewardManager = (
  controllerAddress: string, poolId: number, manager: string, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.addManager(poolId, manager), 'Failed to add manager');

export const removeRewardManager = (
  controllerAddress: string, poolId: number, manager: string, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.removeManager(poolId, manager), 'Failed to remove manager');

export const renounceRewardManager = (
  controllerAddress: string, poolId: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.renounceManager(poolId), 'Failed to renounce manager');

export const closeRewardPool = (
  controllerAddress: string, poolId: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.closePool(poolId), 'Failed to close pool');

export async function preflightCloseRewardPool(
  controllerAddress: string,
  poolId: number,
  wallet: any,
  chainId: number,
): Promise<void> {
  try {
    const controller = await getControllerWithSigner(controllerAddress, wallet, chainId);
    await controller.closePool.staticCall(poolId);
  } catch (error) {
    debugRewardPoolError('close-preflight:static-call-failed', error, {
      controllerAddress,
      poolId,
      walletAddress: wallet?.address,
      decodedMessage: decodeRewardError(error, 'This prize pool cannot be cancelled yet.'),
    });
    throw new Error(decodeRewardError(error, 'This prize pool cannot be cancelled yet.'));
  }
}

export const reclaimRewardPool = (
  controllerAddress: string, poolId: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.reclaim(poolId), 'Failed to reclaim funds');

// --- Arbitrator actions (sent from the arbitrator multisig; revert for any other caller) ---

export const freezeRewardPool = (
  controllerAddress: string, poolId: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.freeze(poolId), 'Failed to freeze pool');

export const unfreezeRewardPool = (
  controllerAddress: string, poolId: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.unfreeze(poolId), 'Failed to unfreeze pool');

export const voidRewardAssignment = (
  controllerAddress: string, poolId: number, placement: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.voidAssignment(poolId, placement), 'Failed to void assignment');

export const reassignRewardWinner = (
  controllerAddress: string, poolId: number, placement: number, newWinner: string, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.reassign(poolId, placement, newWinner), 'Failed to reassign winner');

export const extendRewardClaimEnd = (
  controllerAddress: string, poolId: number, newClaimEnd: number, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.extendClaimEnd(poolId, newClaimEnd), 'Failed to extend claim end');

export const resolveRewardDisputeOnchain = (
  controllerAddress: string, poolId: number, placement: number, upheld: boolean, resolutionHash: string, wallet: any, chainId: number,
) => runPoolTx(controllerAddress, wallet, chainId, (c) => c.resolveDispute(poolId, placement, upheld, resolutionHash), 'Failed to record resolution on-chain');

/** Compute the bytes32 rules hash the contract stores; must match the off-chain rules document. */
export function computeRulesHash(rulesText: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(rulesText ?? ''));
}

export const getRewardPoolOnchainState = async (
  controllerAddress: string,
  poolId: number,
  chainId: number,
): Promise<RewardPoolOnchainState | null> => {
  try {
    const provider = await getReadProvider(chainId);
    const controller = new ethers.Contract(controllerAddress, REWARDS_CONTROLLER_ABI, provider);
    const p = await controller.getPool(poolId);
    if (!p.exists) return null;

    const positionCount = Number(p.positionCount);
    const positions: RewardPoolOnchainPosition[] = [];
    for (let placement = 1; placement <= positionCount; placement++) {
      const [pos, claim] = await Promise.all([
        controller.positions(poolId, placement),
        controller.claimable(poolId, placement),
      ]);
      const winner = String(pos.winner);
      positions.push({
        placement,
        amountWei: pos.amount,
        winner: winner === ZERO_ADDRESS ? null : winner,
        assignedAt: Number(pos.assignedAt),
        holdUntil: Number(pos.holdUntil),
        claimed: Boolean(pos.claimed),
        claimedAt: Number(pos.claimedAt),
        opensAt: Number(claim.opensAt),
        canClaim: Boolean(claim.canClaim),
      });
    }

    const attendance = String(p.attendanceController);
    const token = String(p.payoutToken);
    let ticketSupply: bigint | null = null;
    try {
      ticketSupply = await new ethers.Contract(String(p.eventLock), PUBLIC_LOCK_ABI, provider).totalSupply();
    } catch (error) {
      console.warn('[reward-pool] unable to read event ticket supply', error);
    }

    let attendanceCancelInitiated = false;
    let attendanceRefundComplete = false;
    if (attendance !== ZERO_ADDRESS) {
      try {
        const cfg = await new ethers.Contract(attendance, ATTENDANCE_CONTROLLER_ABI, provider)
          .eventConfigByLock(String(p.eventLock));
        attendanceCancelInitiated = Boolean(cfg.cancelInitiated);
        attendanceRefundComplete = Boolean(cfg.refundComplete);
      } catch (error) {
        console.warn('[reward-pool] unable to read attendance early-exit state', error);
      }
    }

    return {
      exists: Boolean(p.exists),
      frozen: Boolean(p.frozen),
      closed: Boolean(p.closed),
      creator: String(p.creator),
      eventLock: String(p.eventLock),
      attendanceController: attendance === ZERO_ADDRESS ? null : attendance,
      payoutToken: token === ZERO_ADDRESS ? null : token,
      totalFundedWei: p.totalFunded,
      claimedAmountWei: p.claimedAmount,
      claimStart: Number(p.claimStart),
      claimEnd: Number(p.claimEnd),
      challengeWindow: Number(p.challengeWindow),
      frozenAccrued: Number(p.frozenAccrued),
      positionCount,
      assignedCount: Number(p.assignedCount),
      ticketSupply,
      attendanceCancelInitiated,
      attendanceRefundComplete,
      attendanceEarlyExitReady: attendanceCancelInitiated && attendanceRefundComplete,
      rulesHash: String(p.rulesHash),
      positions,
    };
  } catch (error) {
    console.error('Error reading reward pool on-chain state:', error);
    return null;
  }
};
