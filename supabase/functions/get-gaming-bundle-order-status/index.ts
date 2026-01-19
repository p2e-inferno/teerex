/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { sanitizePaystackVerifyPayload } from "../_shared/gaming-bundle-issuance.ts";
import {
  getExpectedFiatCurrency,
  getExpectedPaystackAmountKobo,
  verifyPaystackAmountAndCurrency,
  verifyPaystackTransaction,
} from "../_shared/paystack.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { grantLockKey } from "../_shared/unlock.ts";
import { sha256Hex, normalizeClaimCode } from "../_shared/gaming-bundles.ts";

const DEFAULT_KEY_EXPIRATION_SECONDS = 60 * 60 * 24 * 30;
const LOCK_STALE_THRESHOLD_MS = 15 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id || body.orderId;
    const reference = body.reference;
    const claimCode = body.claim_code || body.claimCode;

    if (!orderId && !reference && !claimCode) {
      return new Response(JSON.stringify({ error: "order_id, reference, or claim_code is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);


    let query = supabase
      .from("gaming_bundle_orders")
      .select(`
        id,
        status,
        fulfillment_method,
        payment_provider,
        payment_reference,
        txn_hash,
        token_id,
        eas_uid,
        nft_recipient_address,
        buyer_address,
        amount_fiat,
        fiat_symbol,
        chain_id,
        bundle_address,
        gateway_response,
        issuance_attempts,
        gaming_bundles(
          id,
          bundle_address,
          chain_id,
          price_fiat,
          price_fiat_kobo,
          fiat_symbol,
          key_expiration_duration_seconds
        )
      `)
      .limit(1);

    if (orderId) {
      query = query.eq("id", orderId);
    } else if (reference) {
      query = query.eq("payment_reference", reference);
    } else {
      const normalized = normalizeClaimCode(String(claimCode));
      const hash = await sha256Hex(normalized);
      query = query.eq("claim_code_hash", hash);
    }

    const { data: order, error } = await query.maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (!order) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let currentOrder = order;
    const repairLogs: string[] = [];

    if (currentOrder.payment_provider !== "paystack" || !currentOrder.payment_reference) {
      return new Response(JSON.stringify({
        found: true,
        status: currentOrder.status,
        fulfillment_method: currentOrder.fulfillment_method,
        txn_hash: currentOrder.txn_hash || null,
        token_id: (currentOrder as any).token_id || null,
        eas_uid: currentOrder.eas_uid || null,
        nft_recipient_address: currentOrder.nft_recipient_address || null,
        key_granted: Boolean((currentOrder as any)?.gateway_response?.key_granted),
        repair_logs: repairLogs,
        issuance_trail: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    repairLogs.push("verifying_paystack");
    const verifyPayload = await verifyPaystackTransaction(currentOrder.payment_reference);
    const verifyData = verifyPayload?.data ?? {};
    const verifyStatus = String(verifyData?.status || "").toLowerCase();
    if (verifyStatus !== "success") {
      repairLogs.push(`paystack_status:${verifyStatus || "unknown"}`);
      await supabase
        .from("gaming_bundle_orders")
        .update({
          gateway_response: {
            ...(currentOrder.gateway_response || {}),
            paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
          },
          verified_at: new Date().toISOString(),
        } as any)
        .eq("id", currentOrder.id);
      return new Response(JSON.stringify({
        found: true,
        status: currentOrder.status,
        fulfillment_method: currentOrder.fulfillment_method,
        txn_hash: currentOrder.txn_hash || null,
        token_id: (currentOrder as any).token_id || null,
        eas_uid: currentOrder.eas_uid || null,
        nft_recipient_address: currentOrder.nft_recipient_address || null,
        key_granted: Boolean((currentOrder as any)?.gateway_response?.key_granted),
        repair_logs: repairLogs,
        issuance_trail: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const expectedCurrency = getExpectedFiatCurrency({
      orderCurrency: currentOrder.fiat_symbol,
      bundleCurrency: currentOrder.gaming_bundles?.fiat_symbol,
      defaultCurrency: "NGN",
    });
    const expectedAmount = getExpectedPaystackAmountKobo({
      priceFiatKobo: currentOrder.gaming_bundles?.price_fiat_kobo,
      priceFiat: currentOrder.gaming_bundles?.price_fiat,
      amountFiat: currentOrder.amount_fiat,
    });
    const verificationIssues = verifyPaystackAmountAndCurrency({
      paystackAmountKobo: verifyData?.amount,
      paystackCurrency: verifyData?.currency,
      expectedAmountKobo: expectedAmount,
      expectedCurrency,
    });

    if (verificationIssues.length) {
      repairLogs.push(`verification_failed:${verificationIssues.join(",")}`);
      await supabase
        .from("gaming_bundle_orders")
        .update({
          status: "FAILED",
          gateway_response: {
            ...(currentOrder.gateway_response || {}),
            paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
            verification_issues: verificationIssues,
          },
          verified_at: new Date().toISOString(),
        } as any)
        .eq("id", currentOrder.id);

      return new Response(JSON.stringify({
        found: true,
        status: "FAILED",
        fulfillment_method: currentOrder.fulfillment_method,
        txn_hash: currentOrder.txn_hash || null,
        token_id: (currentOrder as any).token_id || null,
        eas_uid: currentOrder.eas_uid || null,
        nft_recipient_address: currentOrder.nft_recipient_address || null,
        key_granted: false,
        repair_logs: repairLogs,
        issuance_trail: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { data: updatedOrder } = await supabase
      .from("gaming_bundle_orders")
      .update({
        status: "PAID",
        gateway_response: {
          ...(currentOrder.gateway_response || {}),
          paystack_verify: sanitizePaystackVerifyPayload(verifyPayload),
        },
        verified_at: new Date().toISOString(),
      } as any)
      .eq("id", currentOrder.id)
      .select(`
        id, status, fulfillment_method, payment_provider, payment_reference, txn_hash, token_id, eas_uid, nft_recipient_address, buyer_address, amount_fiat, fiat_symbol, chain_id, bundle_address, gateway_response, issuance_attempts,
        gaming_bundles(id, bundle_address, chain_id, price_fiat, fiat_symbol, key_expiration_duration_seconds)
      `)
      .single();
    if (updatedOrder) currentOrder = updatedOrder;

    if (currentOrder.txn_hash || (currentOrder.gateway_response as any)?.key_granted) {
      repairLogs.push("already_issued");
      return new Response(JSON.stringify({
        found: true,
        status: currentOrder.status,
        fulfillment_method: currentOrder.fulfillment_method,
        txn_hash: currentOrder.txn_hash || null,
        token_id: (currentOrder as any).token_id || null,
        eas_uid: currentOrder.eas_uid || null,
        nft_recipient_address: currentOrder.nft_recipient_address || null,
        key_granted: true,
        repair_logs: repairLogs,
        issuance_trail: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const bundle = currentOrder.gaming_bundles;
    const lockAddress: string | undefined = bundle?.bundle_address || currentOrder.bundle_address;
    const recipient: string | undefined = (currentOrder.nft_recipient_address || currentOrder.buyer_address || "").toLowerCase();
    const chainId = Number(bundle?.chain_id || currentOrder.chain_id);
    const expirationSeconds = Number(bundle?.key_expiration_duration_seconds || DEFAULT_KEY_EXPIRATION_SECONDS);
    const lockId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const staleBeforeDate = new Date(Date.now() - LOCK_STALE_THRESHOLD_MS);
    const staleBefore = staleBeforeDate.toISOString();
    const attempts = (currentOrder.issuance_attempts ?? 0) + 1;
    const { data: lockState } = await supabase
      .from("gaming_bundle_orders")
      .select("issuance_lock_id,issuance_locked_at")
      .eq("id", currentOrder.id)
      .maybeSingle();

    const lockedAt = lockState?.issuance_locked_at ? new Date(lockState.issuance_locked_at) : null;
    const isStale = !lockedAt || lockedAt.getTime() < staleBeforeDate.getTime();

    if (lockState?.issuance_lock_id && !isStale) {
      repairLogs.push("issuance_locked");
      return new Response(JSON.stringify({
        found: true,
        status: currentOrder.status,
        fulfillment_method: currentOrder.fulfillment_method,
        txn_hash: currentOrder.txn_hash || null,
        token_id: (currentOrder as any).token_id || null,
        eas_uid: currentOrder.eas_uid || null,
        nft_recipient_address: currentOrder.nft_recipient_address || null,
        key_granted: Boolean((currentOrder as any)?.gateway_response?.key_granted),
        repair_logs: repairLogs,
        issuance_trail: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let lockQuery = supabase
      .from("gaming_bundle_orders")
      .update({
        issuance_lock_id: lockId,
        issuance_locked_at: nowIso,
        issuance_attempts: attempts,
        issuance_last_error: null,
      } as any)
      .eq("id", currentOrder.id);

    if (lockState?.issuance_lock_id && lockedAt) {
      lockQuery = lockQuery.eq("issuance_lock_id", lockState.issuance_lock_id).lt("issuance_locked_at", staleBefore);
    } else {
      lockQuery = lockQuery.is("issuance_lock_id", null).is("issuance_locked_at", null);
    }

    const { data: lockedOrder } = await lockQuery
      .select("id,issuance_lock_id,issuance_locked_at,txn_hash,token_id,gateway_response")
      .maybeSingle();

    if (!lockedOrder || (lockedOrder as any).issuance_lock_id !== lockId) {
      repairLogs.push("issuance_locked");
      return new Response(JSON.stringify({
        found: true,
        status: currentOrder.status,
        fulfillment_method: currentOrder.fulfillment_method,
        txn_hash: currentOrder.txn_hash || null,
        token_id: (currentOrder as any).token_id || null,
        eas_uid: currentOrder.eas_uid || null,
        nft_recipient_address: currentOrder.nft_recipient_address || null,
        key_granted: Boolean((currentOrder as any)?.gateway_response?.key_granted),
        repair_logs: repairLogs,
        issuance_trail: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    try {
      const networkConfig = await validateChain(supabase, chainId);
      if (!networkConfig?.rpc_url) throw new Error(`rpc_not_configured:${chainId}`);

      const serviceWalletPrivateKey: string | undefined =
        (Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") ?? Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") ?? Deno.env.get("SERVICE_PK"));

      if (!serviceWalletPrivateKey) throw new Error("missing_service_pk");
      if (!lockAddress || !recipient) throw new Error("missing_lock_or_recipient");

      let granted = false;
      let grantTxHash: string | undefined;
      let tokenId: string | null = null;
      const grantResult = await grantLockKey({
        rpcUrl: networkConfig.rpc_url,
        chainId,
        lockAddress,
        serviceWalletPrivateKey,
        recipient,
        expirationSeconds,
        keyManager: recipient,
        requireTokenId: false,
      });
      granted = true;
      if (!grantResult.alreadyHasKey) {
        grantTxHash = grantResult.txHash;
        tokenId = grantResult.tokenId ?? null;
      }

      await supabase
        .from("gaming_bundle_orders")
        .update({
          status: "PAID",
          fulfillment_method: "NFT",
          txn_hash: grantTxHash || currentOrder.txn_hash,
          nft_recipient_address: recipient,
          token_id: tokenId || (currentOrder as any).token_id,
          gateway_response: {
            ...(currentOrder.gateway_response || {}),
            key_granted: true,
            ...(grantTxHash ? { key_grant_tx_hash: grantTxHash } : {}),
          },
          issuance_lock_id: null,
          issuance_locked_at: null,
          issuance_last_error: null,
        } as any)
        .eq("id", currentOrder.id)
        .eq("issuance_lock_id", lockId);

      repairLogs.push(granted ? "key_granted" : "key_already_granted");
    } catch (e: any) {
      repairLogs.push(`issuance_error:${e?.message || "unknown"}`);
      await supabase
        .from("gaming_bundle_orders")
        .update({
          issuance_last_error: e?.message || "issuance_failed",
          issuance_lock_id: null,
          issuance_locked_at: null,
        } as any)
        .eq("id", currentOrder.id)
        .eq("issuance_lock_id", lockId);
    }

    const { data: finalOrder } = await supabase
      .from("gaming_bundle_orders")
      .select(`
        id, status, fulfillment_method, payment_provider, payment_reference, txn_hash, token_id, eas_uid, nft_recipient_address, buyer_address, amount_fiat, fiat_symbol, chain_id, bundle_address, gateway_response, issuance_attempts,
        gaming_bundles(id, bundle_address, chain_id, price_fiat, fiat_symbol, key_expiration_duration_seconds)
      `)
      .eq("id", currentOrder.id)
      .single();
    if (finalOrder) currentOrder = finalOrder;

    return new Response(JSON.stringify({
      found: true,
      status: currentOrder.status,
      fulfillment_method: currentOrder.fulfillment_method,
      txn_hash: currentOrder.txn_hash || null,
      token_id: (currentOrder as any).token_id || null,
      eas_uid: currentOrder.eas_uid || null,
      nft_recipient_address: currentOrder.nft_recipient_address || null,
      key_granted: Boolean((currentOrder as any)?.gateway_response?.key_granted),
      repair_logs: repairLogs,
      issuance_trail: (currentOrder as any)?.gateway_response?.issuance_trail || []
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
