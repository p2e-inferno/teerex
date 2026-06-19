/* deno-lint-ignore-file no-explicit-any */
import { ethers } from "https://esm.sh/ethers@6.14.4";
import PublicLockV15 from "./abi/PublicLockV15.json" assert { type: "json" };
import TicketPassControllerAbi from "./abi/TeeRexTicketPassControllerV1.json" assert { type: "json" };
import { validateChain } from "./network-helpers.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "./divvi.ts";

/**
 * Deterministic on-chain idempotency key for an order. keccak256 of the payment reference,
 * so the same payment can never fund two dispenses even across retries / provider switches.
 */
export function orderRefFromReference(reference: string): string {
  return ethers.id(String(reference));
}

/**
 * Acquire an issuance lock on a ticket_pass_orders row. Mirrors the gaming-bundle issuance lock:
 * a stale lock (older than ttl) can be reclaimed so a crashed worker never wedges an order.
 */
export async function acquireTicketPassIssuanceLock(params: {
  supabase: any;
  orderId: string;
  currentAttempts: number;
  lockTtlMinutes?: number;
}): Promise<{ lockId: string | null; lockedAt?: string }> {
  const { supabase, orderId, currentAttempts, lockTtlMinutes = 5 } = params;
  const lockId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - lockTtlMinutes * 60 * 1000).toISOString();

  const { data: locked, error } = await supabase
    .from("ticket_pass_orders")
    .update({
      issuance_lock_id: lockId,
      issuance_locked_at: nowIso,
      issuance_attempts: currentAttempts,
      last_error: null,
    })
    .eq("id", orderId)
    .or(`issuance_lock_id.is.null,issuance_locked_at.lt.${staleBefore}`)
    .select("id,issuance_lock_id")
    .maybeSingle();

  if (error) {
    console.error(`[ticket-pass-lock] [${orderId}] lock acquisition error:`, error.message);
    return { lockId: null };
  }
  if (!locked || String(locked.issuance_lock_id) !== lockId) {
    return { lockId: null, lockedAt: locked?.issuance_locked_at };
  }
  return { lockId };
}

export async function releaseTicketPassIssuanceLock(params: {
  supabase: any;
  orderId: string;
  lockId: string;
  lastError?: string | null;
  markStatus?: "FAILED" | null;
}): Promise<void> {
  const { supabase, orderId, lockId, lastError = null, markStatus = null } = params;
  await supabase
    .from("ticket_pass_orders")
    .update({
      ...(markStatus ? { status: markStatus } : {}),
      last_error: lastError,
      issuance_lock_id: null,
      issuance_locked_at: null,
    })
    .eq("id", orderId)
    .eq("issuance_lock_id", lockId);
}

async function appendTrail(supabase: any, orderId: string, event: string, meta: any = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[ticket-pass-trail] [${orderId}] ${event}`, meta);
  const { data: latest } = await supabase
    .from("ticket_pass_orders")
    .select("gateway_response")
    .eq("id", orderId)
    .single();
  const old = latest?.gateway_response || {};
  const trail = [...(old.issuance_trail || []), { event, timestamp, ...meta }];
  await supabase
    .from("ticket_pass_orders")
    .update({ gateway_response: { ...old, issuance_trail: trail } })
    .eq("id", orderId);
}

function getServiceSigner(rpcUrl: string) {
  const pk =
    Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") ??
    Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") ??
    Deno.env.get("SERVICE_PK");
  if (!pk) throw new Error("missing_service_pk");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(pk, provider);
}

/**
 * Mark the pass SOLD_OUT once the controller reports no remaining copies. Best-effort.
 */
async function maybeMarkSoldOut(supabase: any, controller: any, pass: any) {
  try {
    const remaining: bigint = await controller.remainingCopies(pass.lock_address);
    if (remaining <= 0n && pass.status !== "SOLD_OUT" && pass.status !== "CLOSED") {
      await supabase.from("ticket_passes").update({ status: "SOLD_OUT" }).eq("id", pass.id);
    }
  } catch (err: any) {
    console.warn(`[ticket-pass-issuance] remainingCopies check failed:`, err?.message);
  }
}

async function recoverLatestTokenId(lockAddress: string, recipient: string, signer: any): Promise<string | null> {
  try {
    const lock = new ethers.Contract(lockAddress, PublicLockV15 as any, signer);
    const balance: bigint = await lock.balanceOf(recipient);
    if (balance > 0n) {
      const tid = await lock.tokenOfOwnerByIndex(recipient, balance - 1n);
      return String(tid);
    }
  } catch (err: any) {
    console.warn(`[ticket-pass-issuance] tokenId recovery failed:`, err?.message);
  }
  return null;
}

/**
 * Core fulfilment for a verified, PAID ticket pass order.
 *
 * Payment-provider agnostic: callers (confirm-ticket-pass-paystack today, a future
 * confirm-ticket-pass-paycrest) must have already verified payment and set the order to PAID.
 * This function performs the atomic on-chain grant+dispense and reconciles the DB.
 *
 * Atomicity / race-safety:
 *  - Caller holds the DB issuance lock (single in-flight worker per order).
 *  - `grantAndDispense` mints the key, marks it redeemed, and transfers value in ONE on-chain tx.
 *  - `processedOrder[orderRef]` is checked first; a replayed/duplicated call never double-dispenses,
 *    even if a previous attempt crashed after the tx but before the DB write.
 */
export async function issueTicketPassFromVerifiedOrder(params: {
  supabase: any;
  order: any;
  pass: any;
  lockId: string;
}): Promise<{ ok: true; already_issued?: boolean; txHash?: string; tokenId?: string | null }> {
  const { supabase, order, pass, lockId } = params;
  const orderId = order.id;
  const nowIso = new Date().toISOString();

  await appendTrail(supabase, orderId, "issuance_started", { lockId });

  // Already dispensed → idempotent success.
  if (String(order.status).toUpperCase() === "DISPENSED" && order.token_id) {
    await appendTrail(supabase, orderId, "already_dispensed", { tokenId: order.token_id });
    await releaseTicketPassIssuanceLock({ supabase, orderId, lockId });
    return { ok: true, already_issued: true, txHash: order.grant_dispense_txn_hash, tokenId: order.token_id };
  }

  const chainId = Number(pass.chain_id ?? order.chain_id);
  const lockAddress = String(pass.lock_address || order.lock_address || "");
  const controllerAddress = String(pass.controller_address || "");
  const recipient = String(order.buyer_address || "").toLowerCase();
  const orderRef = String(order.order_ref || orderRefFromReference(order.payment_reference));

  if (!lockAddress || !controllerAddress || !recipient || !ethers.isAddress(recipient)) {
    const error = "missing_lock_controller_or_recipient";
    await appendTrail(supabase, orderId, "error", { error, lockAddress, controllerAddress, recipient });
    await releaseTicketPassIssuanceLock({ supabase, orderId, lockId, lastError: error, markStatus: "FAILED" });
    throw new Error(error);
  }

  const networkConfig = await validateChain(supabase, chainId);
  if (!networkConfig?.rpc_url) {
    const error = "rpc_not_configured";
    await appendTrail(supabase, orderId, "error", { error, chainId });
    await releaseTicketPassIssuanceLock({ supabase, orderId, lockId, lastError: error, markStatus: "FAILED" });
    throw new Error(error);
  }

  let signer: any;
  try {
    signer = getServiceSigner(networkConfig.rpc_url);
  } catch (err: any) {
    await appendTrail(supabase, orderId, "error", { error: err?.message });
    await releaseTicketPassIssuanceLock({ supabase, orderId, lockId, lastError: err?.message, markStatus: "FAILED" });
    throw err;
  }

  const controller = new ethers.Contract(controllerAddress, TicketPassControllerAbi as any, signer);

  let txHash: string | undefined = order.grant_dispense_txn_hash || undefined;
  let tokenId: string | null = order.token_id || null;

  // On-chain idempotency backstop: if this orderRef was already processed, reconcile without re-dispensing.
  let alreadyProcessed = false;
  try {
    alreadyProcessed = await controller.processedOrder(orderRef);
  } catch (err: any) {
    console.warn(`[ticket-pass-issuance] [${orderId}] processedOrder check failed:`, err?.message);
  }

  if (alreadyProcessed) {
    await appendTrail(supabase, orderId, "order_already_processed_onchain", { orderRef });
    if (!tokenId) tokenId = await recoverLatestTokenId(lockAddress, recipient, signer);
  } else {
    try {
      await appendTrail(supabase, orderId, "grant_dispense_started", { recipient, orderRef });
      const calldata = controller.interface.encodeFunctionData("grantAndDispense", [
        lockAddress,
        recipient,
        orderRef,
      ]);
      const taggedData = await appendDivviTagToCalldataAsync({
        data: calldata,
        user: signer.address as `0x${string}`,
      }).catch(() => calldata);

      const txSend = await signer.sendTransaction({ to: controllerAddress, data: taggedData });
      txHash = txSend.hash;
      await appendTrail(supabase, orderId, "transaction_sent", { txHash });

      const receipt = await txSend.wait();
      await appendTrail(supabase, orderId, "transaction_mined", { txHash: receipt.hash, status: receipt.status });
      if (receipt.status !== 1) throw new Error(`transaction_failed:${receipt.hash}`);

      // Extract tokenId from the PassGrantedAndDispensed event.
      for (const log of receipt.logs || []) {
        try {
          const parsed = controller.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name === "PassGrantedAndDispensed") {
            tokenId = String(parsed.args.tokenId);
            break;
          }
        } catch {
          // not our event
        }
      }
      if (!tokenId) tokenId = await recoverLatestTokenId(lockAddress, recipient, signer);

      if (txHash && chainId) {
        await submitDivviReferralBestEffort({ txHash, chainId }).catch(() => {});
      }
    } catch (err: any) {
      await appendTrail(supabase, orderId, "blockchain_error", { error: err?.message });
      await releaseTicketPassIssuanceLock({ supabase, orderId, lockId, lastError: `blockchain_error:${err?.message}` });
      throw err;
    }
  }

  const { error: finalError } = await supabase
    .from("ticket_pass_orders")
    .update({
      status: "DISPENSED",
      token_id: tokenId,
      grant_dispense_txn_hash: txHash || order.grant_dispense_txn_hash,
      order_ref: orderRef,
      dispensed_at: nowIso,
      verified_at: order.verified_at || nowIso,
      issuance_lock_id: null,
      issuance_locked_at: null,
    })
    .eq("id", orderId)
    .eq("issuance_lock_id", lockId);

  if (finalError) {
    await appendTrail(supabase, orderId, "database_update_failed", { error: finalError.message });
    throw new Error(`db_update_failed:${finalError.message}`);
  }

  await maybeMarkSoldOut(supabase, controller, pass);
  await appendTrail(supabase, orderId, "issuance_complete", { txHash, tokenId });

  return { ok: true, txHash, tokenId };
}
