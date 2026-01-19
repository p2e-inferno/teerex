/* deno-lint-ignore-file no-explicit-any */
import { ethers } from "https://esm.sh/ethers@6.14.4";
import PublicLockV15 from "./abi/PublicLockV15.json" assert { type: "json" };
import { validateChain } from "./network-helpers.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "./divvi.ts";
import { extractTokenIdFromReceipt } from "./nft-helpers.ts";
import { getExpectedFiatCurrency, getExpectedPaystackAmountKobo, verifyPaystackAmountAndCurrency } from "./paystack.ts";

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function sanitizePaystackVerifyPayload(payload: any) {
  const data = payload?.data ?? {};
  return {
    id: data?.id,
    status: data?.status,
    reference: data?.reference,
    amount: data?.amount,
    currency: data?.currency,
    paid_at: data?.paid_at,
    channel: data?.channel,
    gateway_response: data?.gateway_response,
    customer: data?.customer?.email ? { email: data.customer.email } : undefined,
  };
}

/**
 * Acquire a lock for gaming bundle NFT issuance
 */
export async function acquireGamingBundleIssuanceLock(params: {
  supabase: any;
  orderId: string;
  currentAttempts: number;
  lockTtlMinutes?: number;
}): Promise<{ lockId: string | null; lockedAt?: string }> {
  const { supabase, orderId, currentAttempts, lockTtlMinutes = 5 } = params;
  const lockId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - lockTtlMinutes * 60 * 1000).toISOString();

  console.log(`[bundle-lock] [${orderId}] attempting to acquire lock. attempts: ${currentAttempts}`);

  const { data: lockedOrder, error: lockError } = await supabase
    .from("gaming_bundle_orders")
    .update({
      issuance_lock_id: lockId,
      issuance_locked_at: nowIso,
      issuance_attempts: currentAttempts,
      issuance_last_error: null,
    } as any)
    .eq("id", orderId)
    .or(`issuance_lock_id.is.null,issuance_locked_at.lt.${staleBefore}`)
    .select("id,issuance_lock_id,issuance_locked_at")
    .maybeSingle();

  if (lockError) {
    console.error(`[bundle-lock] [${orderId}] database error during lock acquisition:`, lockError.message);
    return { lockId: null };
  }

  if (!lockedOrder || String(lockedOrder.issuance_lock_id) !== lockId) {
    console.warn(`[bundle-lock] [${orderId}] acquisition failed. currently held by: ${lockedOrder?.issuance_lock_id} since ${lockedOrder?.issuance_locked_at}`);
    return { lockId: null, lockedAt: lockedOrder?.issuance_locked_at };
  }

  console.log(`[bundle-lock] [${orderId}] acquired. lockId: ${lockId}`);
  return { lockId };
}

/**
 * Release the issuance lock
 */
export async function releaseGamingBundleIssuanceLock(params: {
  supabase: any;
  orderId: string;
  lockId: string;
  lastError?: string | null;
  markStatus?: "FAILED" | null;
}): Promise<void> {
  const { supabase, orderId, lockId, lastError = null, markStatus = null } = params;
  console.log(`[bundle-lock] [${orderId}] releasing lock. lockId: ${lockId}, status: ${markStatus}, error: ${lastError}`);
  await supabase
    .from("gaming_bundle_orders")
    .update({
      ...(markStatus ? { status: markStatus } : {}),
      issuance_last_error: lastError,
      issuance_lock_id: null,
      issuance_locked_at: null,
    } as any)
    .eq("id", orderId)
    .eq("issuance_lock_id", lockId);
}

/**
 * Main NFT issuance logic for gaming bundles
 */
export async function issueGamingBundleNftFromPaystackVerify(params: {
  supabase: any;
  order: any;
  lockId: string;
  verifyPayload: any;
}): Promise<{ ok: true; already_issued?: boolean; txHash?: string; tokenId?: string | null; already_has_key?: boolean }> {
  const { supabase, order, lockId, verifyPayload } = params;
  const orderId = order.id;
  const nowIso = new Date().toISOString();

  console.log(`[bundle-issuance] [${orderId}] starting issuance process. lockId: ${lockId}`);

  // Helper to append a trail entry to the gateway_response
  const appendTrail = async (event: string, meta: any = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[bundle-trail] [${orderId}] Event: ${event}`, meta);

    // Fetch latest to avoid overwriting other fields in gateway_response
    const { data: latest } = await supabase.from("gaming_bundle_orders").select("gateway_response").eq("id", orderId).single();
    const oldResponse = latest?.gateway_response || {};
    const trail = [...(oldResponse.issuance_trail || []), { event, timestamp, ...meta }];

    await supabase.from("gaming_bundle_orders").update({
      gateway_response: { ...oldResponse, issuance_trail: trail }
    } as any).eq("id", orderId);
  };

  await appendTrail("issuance_started", { lockId });

  // 1. Paystack Verification Check
  const verifyData = verifyPayload?.data ?? {};
  const verifyStatus = String(verifyData?.status || "").toLowerCase();
  const expectedCurrency = getExpectedFiatCurrency({
    orderCurrency: order.fiat_symbol,
    bundleCurrency: order.gaming_bundles?.fiat_symbol,
    defaultCurrency: "NGN",
  });
  const expectedAmount = getExpectedPaystackAmountKobo({
    priceFiatKobo: (order.gaming_bundles as any)?.price_fiat_kobo,
    priceFiat: order.gaming_bundles?.price_fiat,
    amountFiat: order.amount_fiat,
  });

  const verificationIssues: string[] = [];
  if (verifyStatus !== "success") verificationIssues.push("status_not_success");
  verificationIssues.push(...verifyPaystackAmountAndCurrency({
    paystackAmountMinor: verifyData?.amount,
    paystackCurrency: verifyData?.currency,
    expectedAmountMinor: expectedAmount,
    expectedCurrency,
  }));

  if (verificationIssues.length) {
    console.warn(`[bundle-issuance] [${orderId}] verification failed:`, verificationIssues);
    await appendTrail("verification_failed", { issues: verificationIssues, expectedAmount });

    await releaseGamingBundleIssuanceLock({
      supabase,
      orderId,
      lockId,
      markStatus: "FAILED",
      lastError: `paystack_verification_failed:${verificationIssues.join(",")}`,
    });

    await supabase.from("gaming_bundle_orders").update({
      gateway_response: {
        ...(order.gateway_response || {}),
        paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
        verification_issues: verificationIssues,
      },
      verified_at: nowIso,
    } as any).eq("id", orderId);

    throw new Error("verification_failed");
  }

  // 2. Already Issued Check
  if (String(order.status).toUpperCase() === "PAID" && order.txn_hash) {
    console.log(`[bundle-issuance] [${orderId}] already has txn_hash: ${order.txn_hash}`);
    await appendTrail("already_issued_check_hit", { txHash: order.txn_hash });

    await supabase.from("gaming_bundle_orders").update({
      gateway_response: {
        ...(order.gateway_response || {}),
        paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
        key_granted: true,
      },
      verified_at: nowIso,
      issuance_lock_id: null,
      issuance_locked_at: null,
    } as any).eq("id", orderId).eq("issuance_lock_id", lockId);

    return { ok: true, already_issued: true, txHash: order.txn_hash, tokenId: order.token_id };
  }

  // 3. Chain/Contract Preparation
  const chainId = Number(order.gaming_bundles?.chain_id || order.chain_id);
  const lockAddress = String(order.gaming_bundles?.bundle_address || order.bundle_address || "");
  const recipient = String(order.nft_recipient_address || order.buyer_address || "").toLowerCase();

  if (!lockAddress || !recipient) {
    const error = "missing_lock_or_recipient";
    console.error(`[bundle-issuance] [${orderId}] error: ${error}`, { lockAddress, recipient });
    await appendTrail("error", { error, lockAddress, recipient });
    await releaseGamingBundleIssuanceLock({ supabase, orderId, lockId, lastError: error, markStatus: "FAILED" });
    throw new Error(error);
  }

  const networkConfig = await validateChain(supabase, chainId);
  if (!networkConfig?.rpc_url) {
    const error = "rpc_not_configured";
    console.error(`[bundle-issuance] [${orderId}] error: ${error}`, { chainId });
    await appendTrail("error", { error, chainId });
    await releaseGamingBundleIssuanceLock({ supabase, orderId, lockId, lastError: error, markStatus: "FAILED" });
    throw new Error(error);
  }

  const serviceWalletPrivateKey: string | undefined =
    (Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") ?? Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") ?? Deno.env.get("SERVICE_PK"));

  if (!serviceWalletPrivateKey) {
    const error = "missing_service_pk";
    console.error(`[bundle-issuance] [${orderId}] error: ${error}`);
    await appendTrail("error", { error });
    await releaseGamingBundleIssuanceLock({ supabase, orderId, lockId, lastError: error, markStatus: "FAILED" });
    throw new Error(error);
  }

  // 4. Contract Interaction
  console.log(`[bundle-issuance] [${orderId}] initializing provider for chain ${chainId} at ${networkConfig.rpc_url}`);
  const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
  const signer = new ethers.Wallet(serviceWalletPrivateKey, provider);
  const lock = new ethers.Contract(lockAddress, PublicLockV15 as any, signer);
  console.log(`[bundle-issuance] [${orderId}] signer address: ${signer.address}`);

  let grantedTxHash: string | undefined;
  let tokenId: string | null = null;

  console.log(`[bundle-issuance] [${orderId}] checking on-chain key for ${recipient}`);
  await appendTrail("blockchain_check_start", { recipient, lockAddress });

  const hasKey: boolean = await lock.getHasValidKey(recipient).catch((err: any) => {
    console.warn(`[bundle-issuance] [${orderId}] hasKey check failed:`, err.message);
    return false;
  });

  if (!hasKey) {
    console.log(`[bundle-issuance] [${orderId}] key NOT found. granting key...`);
    await appendTrail("grant_keys_started", { recipient });

    const expirationSeconds = Number(order.gaming_bundles?.key_expiration_duration_seconds || 60 * 60 * 24 * 30);
    const expirationTimestamp = Math.floor(Date.now() / 1000) + expirationSeconds;

    const recipients = [recipient];
    const expirations = [BigInt(expirationTimestamp)];
    const keyManagers = [recipient];

    const calldata = lock.interface.encodeFunctionData("grantKeys", [recipients, expirations, keyManagers]);
    const taggedData = await appendDivviTagToCalldataAsync({ data: calldata, user: signer.address as `0x${string}` }).catch(err => {
      console.warn(`[bundle-issuance] [${orderId}] divvi tagging failed:`, err.message);
      return calldata;
    });

    try {
      console.log(`[bundle-issuance] [${orderId}] sending grantKeys transaction...`);
      const txSend = await signer.sendTransaction({ to: lockAddress, data: taggedData });
      grantedTxHash = txSend.hash;
      console.log(`[bundle-issuance] [${orderId}] tx sent: ${grantedTxHash}`);
      await appendTrail("transaction_sent", { txHash: grantedTxHash });

      console.log(`[bundle-issuance] [${orderId}] waiting for confirmation...`);
      const receipt = await txSend.wait();
      console.log(`[bundle-issuance] [${orderId}] tx mined. status: ${receipt.status}`);
      await appendTrail("transaction_mined", { txHash: receipt.hash, status: receipt.status });

      if (receipt.status !== 1) {
        throw new Error(`Transaction failed: ${receipt.hash}`);
      }

      tokenId = await extractTokenIdFromReceipt(receipt, lockAddress, recipient);
      console.log(`[bundle-issuance] [${orderId}] extracted tokenId: ${tokenId}`);
      await appendTrail("token_extracted", { tokenId });

      if (grantedTxHash && chainId) {
        await submitDivviReferralBestEffort({ txHash: grantedTxHash, chainId }).catch(() => { });
      }
    } catch (err: any) {
      console.error(`[bundle-issuance] [${orderId}] blockchain error:`, err.message);
      await appendTrail("blockchain_error", { error: err.message });
      await releaseGamingBundleIssuanceLock({ supabase, orderId, lockId, lastError: `blockchain_error:${err.message}` });
      throw err;
    }
  } else {
    console.log(`[bundle-issuance] [${orderId}] user already has key. fetching data...`);
    await appendTrail("already_has_key_onchain");
    try {
      grantedTxHash = (order.gateway_response as any)?.key_grant_tx_hash || order.txn_hash;
      const balance = await lock.balanceOf(recipient);
      if (Number(balance) > 0) {
        const tid = await lock.tokenOfOwnerByIndex(recipient, 0);
        tokenId = String(tid);
        console.log(`[bundle-issuance] [${orderId}] found existing tokenId: ${tokenId}`);
      }
    } catch (err: any) {
      console.warn(`[bundle-issuance] [${orderId}] failed to recover tokenId:`, err.message);
    }
  }

  // 5. Final Database Update
  console.log(`[bundle-issuance] [${orderId}] finalizing status in DB`);
  const finalGatewayResponse = {
    ...(order.gateway_response || {}),
    paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
    key_granted: true,
    key_grant_tx_hash: grantedTxHash || (order.gateway_response as any)?.key_grant_tx_hash,
  };

  const { error: finalError } = await supabase
    .from("gaming_bundle_orders")
    .update({
      status: "PAID",
      fulfillment_method: "NFT",
      txn_hash: grantedTxHash || order.txn_hash,
      token_id: tokenId || order.token_id,
      nft_recipient_address: recipient,
      gateway_response: finalGatewayResponse,
      verified_at: nowIso,
      issuance_lock_id: null,
      issuance_locked_at: null,
    } as any)
    .eq("id", orderId)
    .eq("issuance_lock_id", lockId);

  if (finalError) {
    console.error(`[bundle-issuance] [${orderId}] final database update failed:`, finalError.message);
    await appendTrail("database_update_failed", { error: finalError.message });
    throw new Error(`DB update failed: ${finalError.message}`);
  }

  await appendTrail("issuance_complete", { txHash: grantedTxHash, tokenId });
  console.log(`[bundle-issuance] [${orderId}] SUCCESS`);

  return { ok: true, txHash: grantedTxHash, tokenId, already_has_key: hasKey };
}
