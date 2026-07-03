/* deno-lint-ignore-file no-explicit-any */
import { Contract, JsonRpcProvider, Wallet, ethers } from "https://esm.sh/ethers@6.14.4";
import type { NetworkConfig } from "./network-helpers.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "./divvi.ts";
import {
  type DgRedemptionConfig,
  getDgRedemptionPayoutMethod,
  getDgRedemptionPayoutPrivateKey,
} from "./dg-redemption.ts";
import { alertAdminDgRedemptionReview } from "./dg-redemption-notify.ts";

const ERC20_PAYOUT_ABI = [
  "function transfer(address to,uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const USDC_OPEN_INTENT_STATUSES = [
  "awaiting_transfer",
  "validating_transfer",
  "payout_pending",
  "payout_processing",
  "manual_review",
];

const CONFIRMATION_WAIT_MS = 60_000;

const SEND_LOCK_STALE_MS = 90_000;
const SEND_LOCK_MAX_ATTEMPTS = 8;
const SEND_LOCK_RETRY_DELAY_MS = 500;

// Serializes the nonce-sensitive send section (nonce fetch, sign, persist, broadcast)
// across concurrent sends from the shared payout wallet on one chain. Returning null
// falls back to unserialized sends, which the persist-before-broadcast CAS guards
// already keep safe from double-pay.
async function acquirePayoutSendLock(supabase: any, chainId: number): Promise<string | null> {
  const { error: seedError } = await supabase
    .from("dg_payout_wallet_locks")
    .upsert({ chain_id: chainId }, { onConflict: "chain_id", ignoreDuplicates: true });
  if (seedError) {
    console.warn("[dg-redemption-payout] send lock seed failed", seedError.message);
    return null;
  }

  const lockId = crypto.randomUUID();
  for (let attempt = 0; attempt < SEND_LOCK_MAX_ATTEMPTS; attempt += 1) {
    const staleBefore = new Date(Date.now() - SEND_LOCK_STALE_MS).toISOString();
    const { data, error } = await supabase
      .from("dg_payout_wallet_locks")
      .update({ lock_id: lockId, locked_at: new Date().toISOString() })
      .eq("chain_id", chainId)
      .or(`lock_id.is.null,locked_at.is.null,locked_at.lt.${staleBefore}`)
      .select("chain_id")
      .maybeSingle();
    if (error) {
      console.warn("[dg-redemption-payout] send lock acquire failed", error.message);
      return null;
    }
    if (data) return lockId;
    await new Promise((resolve) => setTimeout(resolve, SEND_LOCK_RETRY_DELAY_MS));
  }
  return null;
}

async function releasePayoutSendLock(supabase: any, chainId: number, lockId: string): Promise<void> {
  const { error } = await supabase
    .from("dg_payout_wallet_locks")
    .update({ lock_id: null, locked_at: null })
    .eq("chain_id", chainId)
    .eq("lock_id", lockId);
  if (error) console.warn("[dg-redemption-payout] send lock release failed", error.message);
}

export interface UsdcPayoutAvailability {
  payoutWalletAddress: string;
  usdcBalanceMicro: number;
  committedMicro: number;
  availableMicro: number;
}

export interface UsdcPayoutResult {
  status: "completed" | "payout_processing" | "manual_review";
  intent: any;
  txHash: string | null;
  error?: string;
}

export type UsdcFeeTransferStatus = "not_required" | "pending" | "processing" | "completed" | "manual_review";

export interface UsdcFeeTransferResult {
  status: UsdcFeeTransferStatus;
  intent: any;
  txHash: string | null;
  error?: string;
}

export function getDgRedemptionPayoutWallet(network: NetworkConfig): Wallet {
  const key = getDgRedemptionPayoutPrivateKey();
  if (!key) throw new Error("USDC payout signer is not configured (set DG_REDEMPTION_PAYOUT_PRIVATE_KEY)");
  if (!network.rpc_url) throw new Error("RPC URL is not configured");
  return new Wallet(key, new JsonRpcProvider(network.rpc_url));
}

export function requireUsdcTokenAddress(network: NetworkConfig): string {
  const address = network.usdc_token_address?.toLowerCase();
  if (!address || !ethers.isAddress(address)) {
    throw new Error("USDC token address is not configured for this network");
  }
  return address;
}

export async function getUsdcPayoutAvailability(params: {
  supabase: any;
  network: NetworkConfig;
}): Promise<UsdcPayoutAvailability> {
  const wallet = getDgRedemptionPayoutWallet(params.network);
  const usdcAddress = requireUsdcTokenAddress(params.network);
  const usdcToken = new Contract(usdcAddress, ERC20_PAYOUT_ABI, wallet.provider);
  const balanceRaw = await usdcToken.balanceOf(wallet.address);
  const usdcBalanceMicro = Number(BigInt(balanceRaw.toString()));

  const [openResult, feeResult] = await Promise.all([
    params.supabase
      .from("dg_redemption_intents")
      .select("payout_method,net_payout_usdc_micro,service_fee_usdc_micro,fee_transfer_status,status,expires_at")
      .eq("payout_method", "usdc")
      .eq("chain_id", params.network.chain_id)
      .in("status", USDC_OPEN_INTENT_STATUSES),
    params.supabase
      .from("dg_redemption_intents")
      .select("service_fee_usdc_micro,fee_transfer_status,status,expires_at")
      .eq("payout_method", "usdc")
      .eq("chain_id", params.network.chain_id)
      .eq("status", "completed")
      .in("fee_transfer_status", ["pending", "processing", "manual_review"]),
  ]);
  if (openResult.error) throw new Error(openResult.error.message);
  if (feeResult.error) throw new Error(feeResult.error.message);

  const now = Date.now();
  const openCommittedMicro = (openResult.data || []).reduce((total: number, row: any) => {
    const status = String(row.status || "");
    const expiresAtMs = row.expires_at ? Date.parse(String(row.expires_at)) : NaN;
    const timeExpired = ["awaiting_transfer", "validating_transfer"].includes(status) &&
      Number.isFinite(expiresAtMs) && expiresAtMs <= now;
    if (timeExpired) return total;

    const feeStatus = getUsdcFeeTransferStatus(row);
    const pendingFeeMicro = ["pending", "processing", "manual_review"].includes(feeStatus)
      ? Number(row.service_fee_usdc_micro || 0)
      : 0;
    return total + Number(row.net_payout_usdc_micro || 0) + pendingFeeMicro;
  }, 0);
  const feeCommittedMicro = (feeResult.data || []).reduce((total: number, row: any) => {
    return total + Number(row.service_fee_usdc_micro || 0);
  }, 0);
  const committedMicro = openCommittedMicro + feeCommittedMicro;

  return {
    payoutWalletAddress: wallet.address.toLowerCase(),
    usdcBalanceMicro,
    committedMicro,
    availableMicro: Math.max(usdcBalanceMicro - committedMicro, 0),
  };
}

export function canReconcileUsdcPayout(intent: any): boolean {
  return getDgRedemptionPayoutMethod(intent) === "usdc" &&
    String(intent?.status || "") === "payout_processing" &&
    Boolean(intent?.payout_tx_hash);
}

export function getUsdcFeeTransferStatus(intent: any): UsdcFeeTransferStatus {
  if (getDgRedemptionPayoutMethod(intent) !== "usdc" || Number(intent?.service_fee_usdc_micro || 0) <= 0) {
    return "not_required";
  }
  const status = String(intent?.fee_transfer_status || "pending");
  return ["not_required", "pending", "processing", "completed", "manual_review"].includes(status)
    ? status as UsdcFeeTransferStatus
    : "pending";
}

export function canReconcileUsdcFeeTransfer(intent: any): boolean {
  return getDgRedemptionPayoutMethod(intent) === "usdc" &&
    String(intent?.status || "") === "completed" &&
    ["pending", "processing", "manual_review"].includes(getUsdcFeeTransferStatus(intent)) &&
    Boolean(intent?.fee_transfer_tx_hash);
}

export function canRetryUsdcFeeTransfer(intent: any): boolean {
  return getDgRedemptionPayoutMethod(intent) === "usdc" &&
    String(intent?.status || "") === "completed" &&
    ["pending", "processing", "manual_review"].includes(getUsdcFeeTransferStatus(intent));
}

function isAlreadyKnownBroadcastError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already known|already exists|duplicate transaction/i.test(message);
}

async function feeTransferUpdate(
  supabase: any,
  intent: any,
  values: Record<string, unknown>,
  conditions: {
    lockId?: string | null;
    statuses?: UsdcFeeTransferStatus[];
    txHash?: string | null;
  } = {},
): Promise<any | null> {
  let query = supabase
    .from("dg_redemption_intents")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", intent.id);

  if (conditions.lockId) query = query.eq("lock_id", conditions.lockId);
  if (conditions.statuses?.length) query = query.in("fee_transfer_status", conditions.statuses);
  if (conditions.txHash === null) query = query.is("fee_transfer_tx_hash", null);
  if (conditions.txHash) query = query.eq("fee_transfer_tx_hash", conditions.txHash);

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function completeFeeTransfer(params: {
  supabase: any;
  intent: any;
  lockId?: string | null;
  actorUserId: string | null;
  txHash: string;
  chainId: number;
  reconciled?: boolean;
}): Promise<UsdcFeeTransferResult> {
  const updated = await feeTransferUpdate(params.supabase, params.intent, {
    fee_transfer_status: "completed",
    fee_transfer_completed_at: new Date().toISOString(),
    fee_transfer_last_error: null,
    lock_id: null,
    locked_at: null,
  }, {
    lockId: params.lockId,
    statuses: ["pending", "processing", "manual_review"],
    txHash: params.txHash,
  });
  if (!updated) {
    return { status: "processing", intent: params.intent, txHash: params.txHash, error: "lock_lost" };
  }
  await recordPayoutEvent(params.supabase, updated, "usdc_fee_transfer_confirmed", params.actorUserId, {
    fee_transfer_tx_hash: params.txHash,
    reconciled: Boolean(params.reconciled),
  });
  await submitDivviReferralBestEffort({ txHash: params.txHash, chainId: params.chainId });
  return { status: "completed", intent: updated, txHash: params.txHash };
}

async function releaseFeeTransferProcessing(params: {
  supabase: any;
  intent: any;
  lockId?: string | null;
  txHash: string;
}): Promise<UsdcFeeTransferResult> {
  const updated = await feeTransferUpdate(params.supabase, params.intent, {
    fee_transfer_status: "processing",
    lock_id: null,
    locked_at: null,
  }, {
    lockId: params.lockId,
    statuses: ["pending", "processing"],
    txHash: params.txHash,
  });
  const intent = updated || params.intent;
  return { status: getUsdcFeeTransferStatus(intent), intent, txHash: params.txHash };
}

async function markFeeTransferManualReview(params: {
  supabase: any;
  intent: any;
  lockId?: string | null;
  actorUserId: string | null;
  lastError: string;
  metadata?: Record<string, unknown>;
  txHash?: string | null;
}): Promise<UsdcFeeTransferResult> {
  const updated = await feeTransferUpdate(params.supabase, params.intent, {
    fee_transfer_status: "manual_review",
    fee_transfer_last_error: params.lastError,
    lock_id: null,
    locked_at: null,
  }, {
    lockId: params.lockId,
    statuses: ["pending", "processing", "manual_review"],
    txHash: params.txHash === undefined ? undefined : params.txHash,
  });
  if (!updated) {
    return {
      status: getUsdcFeeTransferStatus(params.intent),
      intent: params.intent,
      txHash: params.intent.fee_transfer_tx_hash || params.txHash || null,
      error: "lock_lost",
    };
  }
  const intent = updated || params.intent;
  await recordPayoutEvent(params.supabase, intent, "usdc_fee_transfer_manual_review", params.actorUserId, {
    reason: params.lastError,
    ...(params.metadata || {}),
  });
  await alertAdminDgRedemptionReview({
    supabase: params.supabase,
    intentId: String(intent.id),
    reason: params.lastError,
    actorUserId: params.actorUserId,
    logPrefix: "dg-redemption-payout",
    kind: "fee_transfer",
  });
  return {
    status: "manual_review",
    intent,
    txHash: intent.fee_transfer_tx_hash || params.txHash || null,
    error: params.lastError,
  };
}

function isNonceBroadcastError(error: unknown): boolean {
  const code = (error as any)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "NONCE_EXPIRED" || /nonce too low|nonce is too low|invalid nonce/i.test(message);
}

async function recordPayoutEvent(
  supabase: any,
  intent: any,
  eventType: string,
  actorUserId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("dg_redemption_events").insert({
    intent_id: intent.id,
    event_type: eventType,
    actor_user_id: actorUserId || intent.user_id,
    actor_wallet_address: intent.wallet_address,
    metadata,
  });
  if (error) console.warn("[dg-redemption-payout] event insert failed", error.message);
}

async function lockedIntentUpdate(
  supabase: any,
  intent: any,
  lockId: string,
  values: Record<string, unknown>,
): Promise<any | null> {
  const { data, error } = await supabase
    .from("dg_redemption_intents")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", intent.id)
    .eq("lock_id", lockId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function waitForPayoutReceipt(
  provider: JsonRpcProvider,
  txHash: string,
  requiredConfirmations: number,
): Promise<ethers.TransactionReceipt | null> {
  try {
    return await provider.waitForTransaction(
      txHash,
      Math.max(requiredConfirmations, 1),
      CONFIRMATION_WAIT_MS,
    );
  } catch (_) {
    return null;
  }
}

async function completePayout(params: {
  supabase: any;
  intent: any;
  lockId: string;
  actorUserId: string | null;
  txHash: string;
  chainId: number;
}): Promise<UsdcPayoutResult> {
  const updated = await lockedIntentUpdate(params.supabase, params.intent, params.lockId, {
    status: "completed",
    completed_at: new Date().toISOString(),
    lock_id: null,
    locked_at: null,
    last_error: null,
  });
  if (!updated) {
    return { status: "payout_processing", intent: params.intent, txHash: params.txHash, error: "lock_lost" };
  }
  await recordPayoutEvent(params.supabase, updated, "usdc_payout_confirmed", params.actorUserId, {
    payout_tx_hash: params.txHash,
  });
  await submitDivviReferralBestEffort({ txHash: params.txHash, chainId: params.chainId });
  return { status: "completed", intent: updated, txHash: params.txHash };
}

async function markPayoutManualReview(params: {
  supabase: any;
  intent: any;
  lockId: string;
  actorUserId: string | null;
  lastError: string;
  metadata?: Record<string, unknown>;
}): Promise<UsdcPayoutResult> {
  const updated = await lockedIntentUpdate(params.supabase, params.intent, params.lockId, {
    status: "manual_review",
    lock_id: null,
    locked_at: null,
    last_error: params.lastError,
  });
  if (!updated) {
    return {
      status: "manual_review",
      intent: params.intent,
      txHash: params.intent.payout_tx_hash || null,
      error: "lock_lost",
    };
  }
  await recordPayoutEvent(params.supabase, updated, "usdc_payout_manual_review", params.actorUserId, {
    reason: params.lastError,
    ...(params.metadata || {}),
  });
  await alertAdminDgRedemptionReview({
    supabase: params.supabase,
    intentId: String(updated.id),
    reason: params.lastError,
    actorUserId: params.actorUserId,
    logPrefix: "dg-redemption-payout",
  });
  return { status: "manual_review", intent: updated, txHash: updated.payout_tx_hash || null, error: params.lastError };
}

async function releasePayoutProcessing(params: {
  supabase: any;
  intent: any;
  lockId: string;
  txHash: string;
}): Promise<UsdcPayoutResult> {
  const updated = await lockedIntentUpdate(params.supabase, params.intent, params.lockId, {
    status: "payout_processing",
    lock_id: null,
    locked_at: null,
  });
  return { status: "payout_processing", intent: updated || params.intent, txHash: params.txHash };
}

// Resolves an intent that already has a persisted payout tx: confirm, mark reverted,
// or rebroadcast the stored raw tx. Never signs a new transfer.
async function resolveExistingPayout(params: {
  supabase: any;
  intent: any;
  lockId: string;
  actorUserId: string | null;
  provider: JsonRpcProvider;
  chainId: number;
  requiredConfirmations: number;
}): Promise<UsdcPayoutResult | "reverted"> {
  const txHash = String(params.intent.payout_tx_hash);
  const receipt = await params.provider.getTransactionReceipt(txHash);

  if (receipt) {
    if (receipt.status === 1) {
      const latestBlock = await params.provider.getBlockNumber();
      const confirmations = Math.max(latestBlock - receipt.blockNumber + 1, 0);
      if (confirmations < params.requiredConfirmations) {
        const settled = await waitForPayoutReceipt(params.provider, txHash, params.requiredConfirmations);
        if (!settled) {
          return releasePayoutProcessing({
            supabase: params.supabase,
            intent: params.intent,
            lockId: params.lockId,
            txHash,
          });
        }
      }
      return completePayout({
        supabase: params.supabase,
        intent: params.intent,
        lockId: params.lockId,
        actorUserId: params.actorUserId,
        txHash,
        chainId: params.chainId,
      });
    }
    // Mined but reverted: the nonce is consumed and no funds moved, so a fresh send is safe.
    return "reverted";
  }

  const pendingTx = await params.provider.getTransaction(txHash);
  if (!pendingTx) {
    const rawTx = String(params.intent.payout_raw_tx || "");
    if (!rawTx) {
      return markPayoutManualReview({
        supabase: params.supabase,
        intent: params.intent,
        lockId: params.lockId,
        actorUserId: params.actorUserId,
        lastError: "usdc_payout_missing_raw_tx",
        metadata: { payout_tx_hash: txHash },
      });
    }
    try {
      // Same signed bytes, same nonce, same hash: rebroadcasting can never double-pay.
      await params.provider.broadcastTransaction(rawTx);
      await recordPayoutEvent(params.supabase, params.intent, "usdc_payout_rebroadcast", params.actorUserId, {
        payout_tx_hash: txHash,
      });
    } catch (error) {
      if (isNonceBroadcastError(error)) {
        const stillMissing = !(await params.provider.getTransaction(txHash)) &&
          !(await params.provider.getTransactionReceipt(txHash));
        if (stillMissing) {
          return markPayoutManualReview({
            supabase: params.supabase,
            intent: params.intent,
            lockId: params.lockId,
            actorUserId: params.actorUserId,
            lastError: "usdc_payout_nonce_conflict",
            metadata: { payout_tx_hash: txHash },
          });
        }
      } else if (!isAlreadyKnownBroadcastError(error)) {
        console.warn(
          "[dg-redemption-payout] rebroadcast failed",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  const settled = await waitForPayoutReceipt(params.provider, txHash, params.requiredConfirmations);
  if (!settled) {
    return releasePayoutProcessing({
      supabase: params.supabase,
      intent: params.intent,
      lockId: params.lockId,
      txHash,
    });
  }
  if (settled.status === 1) {
    return completePayout({
      supabase: params.supabase,
      intent: params.intent,
      lockId: params.lockId,
      actorUserId: params.actorUserId,
      txHash,
      chainId: params.chainId,
    });
  }
  return "reverted";
}

export async function executeUsdcPayout(params: {
  supabase: any;
  intent: any;
  lockId: string;
  actorUserId?: string | null;
  network: NetworkConfig;
  config: DgRedemptionConfig;
  // Only admin retries may replace a payout tx that is known to have reverted onchain.
  allowResendAfterRevert?: boolean;
}): Promise<UsdcPayoutResult> {
  const actorUserId = params.actorUserId || null;
  let intent = params.intent;
  const netPayoutMicro = Number(intent.net_payout_usdc_micro || 0);
  const destination = String(intent.payout_wallet_address || "");
  const tokenAddress = String(intent.payout_token_address || "");
  if (getDgRedemptionPayoutMethod(intent) !== "usdc" || netPayoutMicro <= 0 || !destination || !tokenAddress) {
    throw new Error("Intent is not a valid USDC payout");
  }

  const wallet = getDgRedemptionPayoutWallet(params.network);
  const provider = wallet.provider as JsonRpcProvider;
  const requiredConfirmations = params.config.required_confirmations;

  if (intent.payout_tx_hash) {
    const resolved = await resolveExistingPayout({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      provider,
      chainId: params.network.chain_id,
      requiredConfirmations,
    });
    if (resolved !== "reverted") return resolved;
    if (!params.allowResendAfterRevert) {
      return markPayoutManualReview({
        supabase: params.supabase,
        intent,
        lockId: params.lockId,
        actorUserId,
        lastError: "usdc_payout_reverted",
        metadata: { payout_tx_hash: intent.payout_tx_hash },
      });
    }
    const cleared = await lockedIntentUpdate(params.supabase, intent, params.lockId, {
      payout_tx_hash: null,
      payout_raw_tx: null,
      last_error: "usdc_payout_reverted",
    });
    if (!cleared) {
      return { status: "payout_processing", intent, txHash: intent.payout_tx_hash, error: "lock_lost" };
    }
    await recordPayoutEvent(params.supabase, cleared, "usdc_payout_reverted", actorUserId, {
      payout_tx_hash: intent.payout_tx_hash,
    });
    intent = cleared;
  }

  const usdcToken = new Contract(tokenAddress, ERC20_PAYOUT_ABI, provider);
  const balanceMicro = BigInt((await usdcToken.balanceOf(wallet.address)).toString());
  if (balanceMicro < BigInt(netPayoutMicro)) {
    return markPayoutManualReview({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      lastError: "usdc_payout_insufficient_balance",
      metadata: { balance_micro: balanceMicro.toString(), required_micro: netPayoutMicro },
    });
  }

  const iface = new ethers.Interface(ERC20_PAYOUT_ABI);
  const calldata = iface.encodeFunctionData("transfer", [ethers.getAddress(destination), BigInt(netPayoutMicro)]);
  const taggedData = await appendDivviTagToCalldataAsync({
    data: calldata,
    user: wallet.address as `0x${string}`,
  }).catch(() => calldata) || calldata;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sendLockId = await acquirePayoutSendLock(params.supabase, params.network.chain_id);
    let txHash = "";
    try {
      const [nonce, feeData, gasEstimate] = await Promise.all([
        provider.getTransactionCount(wallet.address, "pending"),
        provider.getFeeData(),
        provider.estimateGas({ from: wallet.address, to: tokenAddress, data: taggedData }),
      ]);
      const maxFeePerGas = (feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("1", "gwei")) * 2n;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("0.01", "gwei");

      const signedRaw = await wallet.signTransaction({
        type: 2,
        chainId: params.network.chain_id,
        to: tokenAddress,
        data: taggedData,
        value: 0n,
        nonce,
        gasLimit: (gasEstimate * 12n) / 10n,
        maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : maxPriorityFeePerGas,
      });
      txHash = ethers.Transaction.from(signedRaw).hash || "";
      if (!txHash) throw new Error("Could not derive payout transaction hash");

      // Persist before broadcasting: a crash after this point is recoverable by
      // rebroadcasting the stored raw tx (same nonce, same hash, no double-pay).
      const persisted = await lockedIntentUpdate(params.supabase, intent, params.lockId, {
        status: "payout_processing",
        payout_tx_hash: txHash,
        payout_raw_tx: signedRaw,
        last_error: null,
      });
      if (!persisted) {
        return { status: "payout_processing", intent, txHash: null, error: "lock_lost" };
      }
      intent = persisted;
      await recordPayoutEvent(params.supabase, intent, "usdc_payout_initiated", actorUserId, {
        payout_tx_hash: txHash,
        nonce,
        amount_usdc_micro: netPayoutMicro,
        destination: destination.toLowerCase(),
      });

      try {
        await provider.broadcastTransaction(signedRaw);
      } catch (error) {
        if (isAlreadyKnownBroadcastError(error)) {
          // The tx is in the mempool; proceed to confirmation.
        } else if (isNonceBroadcastError(error) && attempt === 0) {
          const inFlight = await provider.getTransaction(txHash).catch(() => null);
          if (!inFlight) {
            const cleared = await lockedIntentUpdate(params.supabase, intent, params.lockId, {
              payout_tx_hash: null,
              payout_raw_tx: null,
            });
            if (!cleared) {
              return { status: "payout_processing", intent, txHash: null, error: "lock_lost" };
            }
            intent = cleared;
            continue;
          }
        } else {
          return markPayoutManualReview({
            supabase: params.supabase,
            intent,
            lockId: params.lockId,
            actorUserId,
            lastError: "usdc_payout_broadcast_failed",
            metadata: {
              payout_tx_hash: txHash,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    } finally {
      // Confirmation waiting happens outside the send lock; only nonce assignment
      // through broadcast needs serialization.
      if (sendLockId) await releasePayoutSendLock(params.supabase, params.network.chain_id, sendLockId);
    }

    const receipt = await waitForPayoutReceipt(provider, txHash, requiredConfirmations);
    if (!receipt) {
      return releasePayoutProcessing({ supabase: params.supabase, intent, lockId: params.lockId, txHash });
    }
    if (receipt.status === 1) {
      return completePayout({
        supabase: params.supabase,
        intent,
        lockId: params.lockId,
        actorUserId,
        txHash,
        chainId: params.network.chain_id,
      });
    }
    return markPayoutManualReview({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      lastError: "usdc_payout_reverted",
      metadata: { payout_tx_hash: txHash },
    });
  }

  return markPayoutManualReview({
    supabase: params.supabase,
    intent,
    lockId: params.lockId,
    actorUserId,
    lastError: "usdc_payout_nonce_conflict",
  });
}

// Lock-free reconcile for status/list/dashboard reads: compare-and-set completion or
// revert marking for an in-flight payout, plus best-effort rebroadcast of the raw tx.
export async function reconcileUsdcPayout(params: {
  supabase: any;
  intent: any;
  network: NetworkConfig;
  requiredConfirmations: number;
  actorUserId?: string | null;
  logPrefix?: string;
}): Promise<any> {
  if (!canReconcileUsdcPayout(params.intent)) return params.intent;

  try {
    if (!params.network.rpc_url) return params.intent;
    const provider = new JsonRpcProvider(params.network.rpc_url);
    const txHash = String(params.intent.payout_tx_hash);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      const rawTx = String(params.intent.payout_raw_tx || "");
      const pendingTx = await provider.getTransaction(txHash);
      if (!pendingTx && rawTx) {
        await provider.broadcastTransaction(rawTx).catch((error) => {
          if (!isAlreadyKnownBroadcastError(error)) {
            console.warn(
              `[${params.logPrefix || "dg-redemption"}] USDC payout rebroadcast failed`,
              error instanceof Error ? error.message : error,
            );
          }
        });
      }
      return params.intent;
    }

    if (receipt.status === 1) {
      const latestBlock = await provider.getBlockNumber();
      const confirmations = Math.max(latestBlock - receipt.blockNumber + 1, 0);
      if (confirmations < params.requiredConfirmations) return params.intent;

      const { data: updated, error } = await params.supabase
        .from("dg_redemption_intents")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          lock_id: null,
          locked_at: null,
          last_error: null,
        })
        .eq("id", params.intent.id)
        .eq("status", "payout_processing")
        .eq("payout_tx_hash", txHash)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) return params.intent;

      await recordPayoutEvent(params.supabase, updated, "usdc_payout_confirmed", params.actorUserId || null, {
        payout_tx_hash: txHash,
        reconciled: true,
      });
      await submitDivviReferralBestEffort({ txHash, chainId: params.network.chain_id });
      return updated;
    }

    const { data: reverted, error: revertError } = await params.supabase
      .from("dg_redemption_intents")
      .update({
        status: "manual_review",
        lock_id: null,
        locked_at: null,
        last_error: "usdc_payout_reverted",
      })
      .eq("id", params.intent.id)
      .eq("status", "payout_processing")
      .eq("payout_tx_hash", txHash)
      .select("*")
      .maybeSingle();
    if (revertError) throw new Error(revertError.message);
    if (!reverted) return params.intent;

    await recordPayoutEvent(params.supabase, reverted, "usdc_payout_reverted", params.actorUserId || null, {
      payout_tx_hash: txHash,
      reconciled: true,
    });
    await alertAdminDgRedemptionReview({
      supabase: params.supabase,
      intentId: String(reverted.id),
      reason: "usdc_payout_reverted",
      actorUserId: params.actorUserId || null,
      logPrefix: params.logPrefix || "dg-redemption",
    });
    return reverted;
  } catch (error) {
    console.warn(
      `[${params.logPrefix || "dg-redemption"}] USDC payout reconciliation failed`,
      error instanceof Error ? error.message : error,
    );
    return params.intent;
  }
}

async function resolveExistingFeeTransfer(params: {
  supabase: any;
  intent: any;
  lockId?: string | null;
  actorUserId: string | null;
  provider: JsonRpcProvider;
  chainId: number;
  requiredConfirmations: number;
}): Promise<UsdcFeeTransferResult | "reverted"> {
  const txHash = String(params.intent.fee_transfer_tx_hash);
  const receipt = await params.provider.getTransactionReceipt(txHash);

  if (receipt) {
    if (receipt.status === 1) {
      const latestBlock = await params.provider.getBlockNumber();
      const confirmations = Math.max(latestBlock - receipt.blockNumber + 1, 0);
      if (confirmations < params.requiredConfirmations) {
        const settled = await waitForPayoutReceipt(params.provider, txHash, params.requiredConfirmations);
        if (!settled) {
          return releaseFeeTransferProcessing({
            supabase: params.supabase,
            intent: params.intent,
            lockId: params.lockId,
            txHash,
          });
        }
      }
      return completeFeeTransfer({
        supabase: params.supabase,
        intent: params.intent,
        lockId: params.lockId,
        actorUserId: params.actorUserId,
        txHash,
        chainId: params.chainId,
      });
    }
    return "reverted";
  }

  const pendingTx = await params.provider.getTransaction(txHash);
  if (!pendingTx) {
    const rawTx = String(params.intent.fee_transfer_raw_tx || "");
    if (!rawTx) {
      return markFeeTransferManualReview({
        supabase: params.supabase,
        intent: params.intent,
        lockId: params.lockId,
        actorUserId: params.actorUserId,
        lastError: "usdc_fee_transfer_missing_raw_tx",
        metadata: { fee_transfer_tx_hash: txHash },
        txHash,
      });
    }
    try {
      await params.provider.broadcastTransaction(rawTx);
      await recordPayoutEvent(params.supabase, params.intent, "usdc_fee_transfer_rebroadcast", params.actorUserId, {
        fee_transfer_tx_hash: txHash,
      });
    } catch (error) {
      if (isNonceBroadcastError(error)) {
        const stillMissing = !(await params.provider.getTransaction(txHash)) &&
          !(await params.provider.getTransactionReceipt(txHash));
        if (stillMissing) {
          return markFeeTransferManualReview({
            supabase: params.supabase,
            intent: params.intent,
            lockId: params.lockId,
            actorUserId: params.actorUserId,
            lastError: "usdc_fee_transfer_nonce_conflict",
            metadata: { fee_transfer_tx_hash: txHash },
            txHash,
          });
        }
      } else if (!isAlreadyKnownBroadcastError(error)) {
        console.warn(
          "[dg-redemption-payout] fee transfer rebroadcast failed",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  const settled = await waitForPayoutReceipt(params.provider, txHash, params.requiredConfirmations);
  if (!settled) {
    return releaseFeeTransferProcessing({
      supabase: params.supabase,
      intent: params.intent,
      lockId: params.lockId,
      txHash,
    });
  }
  if (settled.status === 1) {
    return completeFeeTransfer({
      supabase: params.supabase,
      intent: params.intent,
      lockId: params.lockId,
      actorUserId: params.actorUserId,
      txHash,
      chainId: params.chainId,
    });
  }
  return "reverted";
}

export async function executeUsdcFeeTransfer(params: {
  supabase: any;
  intent: any;
  network: NetworkConfig;
  config: DgRedemptionConfig;
  actorUserId?: string | null;
  lockId?: string | null;
  allowManualReviewRetry?: boolean;
  allowResendAfterRevert?: boolean;
}): Promise<UsdcFeeTransferResult> {
  const actorUserId = params.actorUserId || null;
  let intent = params.intent;
  const amountMicro = Number(intent.service_fee_usdc_micro || 0);
  const tokenAddress = String(intent.payout_token_address || "");
  const destination = String(intent.redemption_wallet_address || "");
  const currentStatus = getUsdcFeeTransferStatus(intent);

  if (getDgRedemptionPayoutMethod(intent) !== "usdc" || amountMicro <= 0) {
    const updated = currentStatus !== "not_required"
      ? await feeTransferUpdate(params.supabase, intent, {
        fee_transfer_status: "not_required",
        fee_transfer_last_error: null,
        lock_id: null,
        locked_at: null,
      }, { lockId: params.lockId })
      : intent;
    return { status: "not_required", intent: updated || intent, txHash: null };
  }

  if (String(intent.status || "") !== "completed") {
    return { status: currentStatus, intent, txHash: intent.fee_transfer_tx_hash || null };
  }
  if (currentStatus === "completed") {
    return { status: "completed", intent, txHash: intent.fee_transfer_tx_hash || null };
  }
  if (currentStatus === "manual_review" && !params.allowManualReviewRetry && !intent.fee_transfer_tx_hash) {
    return { status: "manual_review", intent, txHash: intent.fee_transfer_tx_hash || null, error: intent.fee_transfer_last_error || undefined };
  }
  if (!tokenAddress || !ethers.isAddress(tokenAddress) || !destination || !ethers.isAddress(destination)) {
    return markFeeTransferManualReview({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      lastError: "usdc_fee_transfer_invalid_destination",
      metadata: { token_address: tokenAddress || null, destination: destination || null },
    });
  }

  const wallet = getDgRedemptionPayoutWallet(params.network);
  const provider = wallet.provider as JsonRpcProvider;
  const requiredConfirmations = params.config.required_confirmations;

  if (intent.fee_transfer_tx_hash) {
    const resolved = await resolveExistingFeeTransfer({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      provider,
      chainId: params.network.chain_id,
      requiredConfirmations,
    });
    if (resolved !== "reverted") return resolved;
    if (!params.allowResendAfterRevert) {
      return markFeeTransferManualReview({
        supabase: params.supabase,
        intent,
        lockId: params.lockId,
        actorUserId,
        lastError: "usdc_fee_transfer_reverted",
        metadata: { fee_transfer_tx_hash: intent.fee_transfer_tx_hash },
        txHash: intent.fee_transfer_tx_hash,
      });
    }
    const cleared = await feeTransferUpdate(params.supabase, intent, {
      fee_transfer_status: "pending",
      fee_transfer_tx_hash: null,
      fee_transfer_raw_tx: null,
      fee_transfer_last_error: "usdc_fee_transfer_reverted",
    }, {
      lockId: params.lockId,
      txHash: intent.fee_transfer_tx_hash,
    });
    if (!cleared) {
      return { status: "processing", intent, txHash: intent.fee_transfer_tx_hash, error: "lock_lost" };
    }
    await recordPayoutEvent(params.supabase, cleared, "usdc_fee_transfer_reverted", actorUserId, {
      fee_transfer_tx_hash: intent.fee_transfer_tx_hash,
    });
    intent = cleared;
  } else if (currentStatus === "processing") {
    return markFeeTransferManualReview({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      lastError: "usdc_fee_transfer_missing_raw_tx",
    });
  }

  const usdcToken = new Contract(tokenAddress, ERC20_PAYOUT_ABI, provider);
  const balanceMicro = BigInt((await usdcToken.balanceOf(wallet.address)).toString());
  if (balanceMicro < BigInt(amountMicro)) {
    return markFeeTransferManualReview({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      lastError: "usdc_fee_transfer_insufficient_balance",
      metadata: { balance_micro: balanceMicro.toString(), required_micro: amountMicro },
    });
  }

  const iface = new ethers.Interface(ERC20_PAYOUT_ABI);
  const calldata = iface.encodeFunctionData("transfer", [ethers.getAddress(destination), BigInt(amountMicro)]);
  const taggedData = await appendDivviTagToCalldataAsync({
    data: calldata,
    user: wallet.address as `0x${string}`,
  }).catch(() => calldata) || calldata;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sendLockId = await acquirePayoutSendLock(params.supabase, params.network.chain_id);
    let txHash = "";
    try {
      const [nonce, feeData, gasEstimate] = await Promise.all([
        provider.getTransactionCount(wallet.address, "pending"),
        provider.getFeeData(),
        provider.estimateGas({ from: wallet.address, to: tokenAddress, data: taggedData }),
      ]);
      const maxFeePerGas = (feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("1", "gwei")) * 2n;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("0.01", "gwei");

      const signedRaw = await wallet.signTransaction({
        type: 2,
        chainId: params.network.chain_id,
        to: tokenAddress,
        data: taggedData,
        value: 0n,
        nonce,
        gasLimit: (gasEstimate * 12n) / 10n,
        maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : maxPriorityFeePerGas,
      });
      txHash = ethers.Transaction.from(signedRaw).hash || "";
      if (!txHash) throw new Error("Could not derive fee transfer transaction hash");

      const persisted = await feeTransferUpdate(params.supabase, intent, {
        fee_transfer_status: "processing",
        fee_transfer_tx_hash: txHash,
        fee_transfer_raw_tx: signedRaw,
        fee_transfer_last_error: null,
      }, {
        lockId: params.lockId,
        statuses: params.allowManualReviewRetry ? ["pending", "manual_review"] : ["pending"],
        txHash: null,
      });
      if (!persisted) {
        return { status: getUsdcFeeTransferStatus(intent), intent, txHash: null, error: "lock_lost" };
      }
      intent = persisted;
      await recordPayoutEvent(params.supabase, intent, "usdc_fee_transfer_initiated", actorUserId, {
        fee_transfer_tx_hash: txHash,
        nonce,
        amount_usdc_micro: amountMicro,
        destination: destination.toLowerCase(),
      });

      try {
        await provider.broadcastTransaction(signedRaw);
      } catch (error) {
        if (isAlreadyKnownBroadcastError(error)) {
          // The tx is in the mempool; proceed to confirmation.
        } else if (isNonceBroadcastError(error) && attempt === 0) {
          const inFlight = await provider.getTransaction(txHash).catch(() => null);
          if (!inFlight) {
            const cleared = await feeTransferUpdate(params.supabase, intent, {
              fee_transfer_status: "pending",
              fee_transfer_tx_hash: null,
              fee_transfer_raw_tx: null,
            }, {
              lockId: params.lockId,
              txHash,
            });
            if (!cleared) {
              return { status: "processing", intent, txHash, error: "lock_lost" };
            }
            intent = cleared;
            continue;
          }
        } else {
          return markFeeTransferManualReview({
            supabase: params.supabase,
            intent,
            lockId: params.lockId,
            actorUserId,
            lastError: "usdc_fee_transfer_broadcast_failed",
            metadata: {
              fee_transfer_tx_hash: txHash,
              error: error instanceof Error ? error.message : String(error),
            },
            txHash,
          });
        }
      }
    } finally {
      // Confirmation waiting happens outside the send lock; only nonce assignment
      // through broadcast needs serialization.
      if (sendLockId) await releasePayoutSendLock(params.supabase, params.network.chain_id, sendLockId);
    }

    const receipt = await waitForPayoutReceipt(provider, txHash, requiredConfirmations);
    if (!receipt) {
      return releaseFeeTransferProcessing({ supabase: params.supabase, intent, lockId: params.lockId, txHash });
    }
    if (receipt.status === 1) {
      return completeFeeTransfer({
        supabase: params.supabase,
        intent,
        lockId: params.lockId,
        actorUserId,
        txHash,
        chainId: params.network.chain_id,
      });
    }
    return markFeeTransferManualReview({
      supabase: params.supabase,
      intent,
      lockId: params.lockId,
      actorUserId,
      lastError: "usdc_fee_transfer_reverted",
      metadata: { fee_transfer_tx_hash: txHash },
      txHash,
    });
  }

  return markFeeTransferManualReview({
    supabase: params.supabase,
    intent,
    lockId: params.lockId,
    actorUserId,
    lastError: "usdc_fee_transfer_nonce_conflict",
  });
}

export async function reconcileUsdcFeeTransfer(params: {
  supabase: any;
  intent: any;
  network: NetworkConfig;
  requiredConfirmations: number;
  actorUserId?: string | null;
  logPrefix?: string;
}): Promise<any> {
  if (!canReconcileUsdcFeeTransfer(params.intent)) return params.intent;

  try {
    if (!params.network.rpc_url) return params.intent;
    const provider = new JsonRpcProvider(params.network.rpc_url);
    const txHash = String(params.intent.fee_transfer_tx_hash || "");
    if (!txHash) return params.intent;

    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      if (receipt.status === 1) {
        const latestBlock = await provider.getBlockNumber();
        const confirmations = Math.max(latestBlock - receipt.blockNumber + 1, 0);
        if (confirmations < params.requiredConfirmations) return params.intent;
        const result = await completeFeeTransfer({
          supabase: params.supabase,
          intent: params.intent,
          actorUserId: params.actorUserId || null,
          txHash,
          chainId: params.network.chain_id,
          reconciled: true,
        });
        return result.intent;
      }
      const result = await markFeeTransferManualReview({
        supabase: params.supabase,
        intent: params.intent,
        actorUserId: params.actorUserId || null,
        lastError: "usdc_fee_transfer_reverted",
        metadata: { fee_transfer_tx_hash: txHash, reconciled: true },
        txHash,
      });
      return result.intent;
    }

    const pendingTx = await provider.getTransaction(txHash);
    if (!pendingTx) {
      const rawTx = String(params.intent.fee_transfer_raw_tx || "");
      if (!rawTx) {
        const result = await markFeeTransferManualReview({
          supabase: params.supabase,
          intent: params.intent,
          actorUserId: params.actorUserId || null,
          lastError: "usdc_fee_transfer_missing_raw_tx",
          metadata: { fee_transfer_tx_hash: txHash, reconciled: true },
          txHash,
        });
        return result.intent;
      }
      try {
        await provider.broadcastTransaction(rawTx);
        await recordPayoutEvent(params.supabase, params.intent, "usdc_fee_transfer_rebroadcast", params.actorUserId || null, {
          fee_transfer_tx_hash: txHash,
          reconciled: true,
        });
      } catch (error) {
        if (isNonceBroadcastError(error)) {
          const stillMissing = !(await provider.getTransaction(txHash)) &&
            !(await provider.getTransactionReceipt(txHash));
          if (stillMissing) {
            const result = await markFeeTransferManualReview({
              supabase: params.supabase,
              intent: params.intent,
              actorUserId: params.actorUserId || null,
              lastError: "usdc_fee_transfer_nonce_conflict",
              metadata: { fee_transfer_tx_hash: txHash, reconciled: true },
              txHash,
            });
            return result.intent;
          }
        } else if (!isAlreadyKnownBroadcastError(error)) {
          console.warn(
            `[${params.logPrefix || "dg-redemption"}] USDC fee transfer rebroadcast failed`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    }

    return params.intent;
  } catch (error) {
    console.warn(
      `[${params.logPrefix || "dg-redemption"}] USDC fee transfer reconciliation failed`,
      error instanceof Error ? error.message : error,
    );
    return params.intent;
  }
}
