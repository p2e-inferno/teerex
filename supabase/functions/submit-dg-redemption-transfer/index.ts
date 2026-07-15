/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { initiatePaystackTransfer } from "../_shared/paystack.ts";
import {
  getDgRedemptionPayoutMethod,
  loadDgRedemptionConfig,
  paystackTransferUpdateValues,
  publicPayoutAccount,
  validateDgTransfer,
  withRedemptionPricingDefaults,
} from "../_shared/dg-redemption.ts";
import { executeUsdcFeeTransfer, executeUsdcPayout } from "../_shared/dg-redemption-payout.ts";
import { alertAdminDgRedemptionReview } from "../_shared/dg-redemption-notify.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function markIntent(
  supabase: any,
  intentId: string,
  lockId: string,
  values: Record<string, unknown>,
  eventType: string,
  metadata: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("dg_redemption_intents")
    .update(values)
    .eq("id", intentId)
    .eq("lock_id", lockId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Redeem DG request lock was lost");
  await supabase.from("dg_redemption_events").insert({
    intent_id: intentId,
    event_type: eventType,
    actor_user_id: data.user_id,
    actor_wallet_address: data.wallet_address,
    metadata,
  });
  if (String((values as any).status) === "manual_review") {
    await alertAdminDgRedemptionReview({
      supabase,
      intentId,
      reason: String((metadata as any)?.reason || (values as any).last_error || eventType),
      actorUserId: data.user_id,
      logPrefix: "submit-dg-redemption-transfer",
    });
  }
  return data;
}

function assertTransferWasAfterQuoteCreated(transferProof: Record<string, unknown>, createdAt: unknown) {
  const blockTimestampMs = Date.parse(String(transferProof.block_timestamp || ""));
  const createdAtMs = Date.parse(String(createdAt || ""));
  if (!Number.isFinite(blockTimestampMs) || !Number.isFinite(createdAtMs)) {
    throw new Error("Could not confirm when the DG transfer was made");
  }
  if (blockTimestampMs + 1000 < createdAtMs) {
    throw new Error("Transaction was made before this Redeem DG quote was created");
  }
}

async function requestExpiredTransferReview(params: {
  supabase: any;
  userId: string;
  intentId: string;
  txHash: string;
}) {
  const { data: intent, error: intentError } = await params.supabase
    .from("dg_redemption_intents")
    .select("*")
    .eq("id", params.intentId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (intentError) throw new Error(intentError.message);
  if (!intent) return json({ ok: false, error: "Redeem DG request was not found" }, 404);
  if (String(intent.status) === "manual_review" && String(intent.tx_hash || "").toLowerCase() === params.txHash) {
    return json({ ok: true, status: intent.status, message: "Redeem DG transfer is already under admin review" });
  }
  if (!["awaiting_transfer", "expired"].includes(String(intent.status))) {
    return json({ ok: false, error: "Redeem DG request cannot be submitted for expired quote review" }, 400);
  }
  if (new Date(intent.expires_at).getTime() > Date.now()) {
    return json({ ok: false, error: "Redeem DG quote has not expired yet" }, 400);
  }
  if (intent.tx_hash && String(intent.tx_hash).toLowerCase() !== params.txHash) {
    return json({ ok: false, error: "Redeem DG request already has a different transaction hash" }, 409);
  }

  const [config, network] = await Promise.all([
    loadDgRedemptionConfig(params.supabase),
    validateChain(params.supabase, intent.chain_id),
  ]);
  if (!network) return json({ ok: false, error: "Network not found or inactive" }, 404);

  const transferProof = await validateDgTransfer({
    network: withRedemptionPricingDefaults(network),
    txHash: params.txHash,
    fromAddress: intent.wallet_address,
    toAddress: intent.redemption_wallet_address,
    dgTokenAddress: intent.dg_token_address,
    amountDgRaw: intent.amount_dg_raw,
    requiredConfirmations: config.required_confirmations,
  });
  assertTransferWasAfterQuoteCreated(transferProof, intent.created_at);

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await params.supabase
    .from("dg_redemption_intents")
    .update({
      status: "manual_review",
      tx_hash: params.txHash,
      lock_id: null,
      locked_at: null,
      last_error: "expired_quote_transfer_submitted",
      updated_at: now,
    })
    .eq("id", intent.id)
    .eq("user_id", params.userId)
    .lte("expires_at", now)
    .in("status", ["awaiting_transfer", "expired"])
    .or(`tx_hash.is.null,tx_hash.eq.${params.txHash}`)
    .select("*")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    return json({ ok: false, error: "Redeem DG request changed. Refresh and try again." }, 409);
  }

  await params.supabase.from("dg_redemption_events").insert({
    intent_id: updated.id,
    event_type: "expired_quote_transfer_submitted_for_review",
    actor_user_id: updated.user_id,
    actor_wallet_address: updated.wallet_address,
    metadata: {
      transfer_proof: transferProof,
      quote_created_at: intent.created_at,
      quote_expires_at: intent.expires_at,
    },
  });
  await alertAdminDgRedemptionReview({
    supabase: params.supabase,
    intentId: updated.id,
    reason: "expired_quote_transfer_submitted",
    actorUserId: updated.user_id,
    logPrefix: "submit-dg-redemption-transfer",
  });

  return json({
    ok: true,
    status: updated.status,
    message: "Redeem DG transfer received and sent for admin review",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const intentId = String(body.intent_id || body.intentId || "").trim();
    const txHash = String(body.tx_hash || body.txHash || "").trim().toLowerCase();
    const requestExpiredReview = Boolean(body.request_expired_review || body.requestExpiredReview);

    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);
    if (!/^0x([A-Fa-f0-9]{64})$/.test(txHash)) {
      return json({ ok: false, error: "Enter a valid transaction hash" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (requestExpiredReview) {
      return await requestExpiredTransferReview({ supabase, userId, intentId, txHash });
    }

    const lockId = crypto.randomUUID();
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: lockedIntent, error: lockError } = await supabase.rpc("acquire_dg_redemption_intent_lock", {
      p_intent_id: intentId,
      p_user_id: userId,
      p_tx_hash: txHash,
      p_lock_id: lockId,
      p_stale_before: staleBefore,
    });

    if (lockError) throw new Error(lockError.message);
    if (!lockedIntent) {
      const { data: existing } = await supabase
        .from("dg_redemption_intents")
        .select("status,expires_at")
        .eq("id", intentId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!existing) return json({ ok: false, error: "Redeem DG request was not found" }, 404);
      return json({
        ok: false,
        error: existing.status === "awaiting_transfer" && new Date(existing.expires_at).getTime() <= Date.now()
          ? "Redeem DG quote has expired"
          : "Redeem DG request is already being processed",
      }, 409);
    }

    const [config, network] = await Promise.all([
      loadDgRedemptionConfig(supabase),
      validateChain(supabase, lockedIntent.chain_id),
    ]);
    if (!network) {
      const message = "Network not found or inactive";
      await markIntent(
        supabase,
        lockedIntent.id,
        lockId,
        {
          status: "awaiting_transfer",
          lock_id: null,
          locked_at: null,
          last_error: message,
        },
        "network_validation_failed",
        { chain_id: lockedIntent.chain_id, error: message },
      );
      return json({ ok: false, error: message }, 404);
    }

    let transferProof: Record<string, unknown>;
    try {
      transferProof = await validateDgTransfer({
        network: withRedemptionPricingDefaults(network),
        txHash,
        fromAddress: lockedIntent.wallet_address,
        toAddress: lockedIntent.redemption_wallet_address,
        dgTokenAddress: lockedIntent.dg_token_address,
        amountDgRaw: lockedIntent.amount_dg_raw,
        requiredConfirmations: config.required_confirmations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transfer validation failed";
      await markIntent(
        supabase,
        lockedIntent.id,
        lockId,
        {
          status: "awaiting_transfer",
          lock_id: null,
          locked_at: null,
          last_error: message,
        },
        "transfer_validation_failed",
        { tx_hash: txHash, error: message },
      );
      return json({ ok: false, error: message }, message.includes("Waiting for") ? 409 : 400);
    }

    if (getDgRedemptionPayoutMethod(lockedIntent) === "usdc") {
      const reviewThresholdMicro = config.usdc.limits.manual_review_usdc_micro;
      if (reviewThresholdMicro > 0 && Number(lockedIntent.net_payout_usdc_micro) >= reviewThresholdMicro) {
        const reviewed = await markIntent(
          supabase,
          lockedIntent.id,
          lockId,
          {
            status: "manual_review",
            lock_id: null,
            locked_at: null,
            last_error: "manual_review_required",
          },
          "manual_review_required",
          { transfer_proof: transferProof },
        );
        return json({
          ok: true,
          status: reviewed.status,
          message: "Redeem DG transfer received and is pending review",
        });
      }

      const pendingIntent = await markIntent(
        supabase,
        lockedIntent.id,
        lockId,
        {
          status: "payout_pending",
          last_error: null,
        },
        "transfer_validated",
        { transfer_proof: transferProof },
      );

      let result;
      try {
        result = await executeUsdcPayout({
          supabase,
          intent: pendingIntent,
          lockId,
          actorUserId: userId,
          network,
          config,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "USDC payout failed";
        await markIntent(
          supabase,
          lockedIntent.id,
          lockId,
          {
            status: "manual_review",
            lock_id: null,
            locked_at: null,
            last_error: message,
          },
          "usdc_payout_admin_review_required",
          { error: message },
        );
        return json({ ok: false, error: message }, 502);
      }

      if (result.status === "manual_review") {
        return json({
          ok: false,
          status: result.status,
          error: "Redeem DG transfer was received, but the payout needs admin attention",
        }, 502);
      }

      let feeTransfer = null;
      if (result.status === "completed") {
        try {
          const feeResult = await executeUsdcFeeTransfer({
            supabase,
            intent: result.intent,
            actorUserId: userId,
            network,
            config,
          });
          feeTransfer = {
            status: feeResult.status,
            tx_hash: feeResult.txHash,
            amount_usdc_micro: Number(result.intent.service_fee_usdc_micro || 0),
            destination: result.intent.redemption_wallet_address,
            error: feeResult.error || null,
          };
        } catch (error) {
          console.warn(
            "[submit-dg-redemption-transfer] USDC fee transfer failed",
            error instanceof Error ? error.message : error,
          );
        }
      }

      return json({
        ok: true,
        status: result.status,
        payout: {
          tx_hash: result.txHash,
          amount_usdc_micro: Number(lockedIntent.net_payout_usdc_micro),
          payout_wallet_address: lockedIntent.payout_wallet_address,
        },
        fee_transfer: feeTransfer,
      });
    }

    const { data: payoutAccount, error: payoutError } = await supabase
      .from("user_payout_accounts")
      .select("*")
      .eq("id", lockedIntent.payout_account_id)
      .eq("user_id", userId)
      .eq("status", "verified")
      .maybeSingle();
    if (payoutError) throw new Error(payoutError.message);
    if (!payoutAccount?.provider_recipient_code) {
      throw new Error("Saved bank account is no longer available");
    }

    if (config.limits.manual_review_ngn_kobo > 0 && lockedIntent.net_payout_kobo >= config.limits.manual_review_ngn_kobo) {
      const reviewed = await markIntent(
        supabase,
        lockedIntent.id,
        lockId,
        {
          status: "manual_review",
          lock_id: null,
          locked_at: null,
          last_error: "manual_review_required",
        },
        "manual_review_required",
        { transfer_proof: transferProof },
      );
      return json({
        ok: true,
        status: reviewed.status,
        message: "Redeem DG transfer received and is pending review",
      });
    }

    await markIntent(
      supabase,
      lockedIntent.id,
      lockId,
      {
        status: "payout_pending",
        last_error: null,
      },
      "transfer_validated",
      { transfer_proof: transferProof },
    );

    try {
      const transfer = await initiatePaystackTransfer({
        source: "balance",
        amount: Number(lockedIntent.net_payout_kobo),
        recipient: payoutAccount.provider_recipient_code,
        reference: lockedIntent.paystack_reference,
        reason: "Event participant payout",
        currency: "NGN",
      });
      const transferValues = paystackTransferUpdateValues({ transfer: transfer.data, failedStatus: "manual_review" });
      const updated = await markIntent(
        supabase,
        lockedIntent.id,
        lockId,
        {
          ...transferValues,
        },
        "paystack_transfer_initiated",
        { paystack_transfer: transfer.data },
      );

      return json({
        ok: true,
        status: updated.status,
        payout_account: publicPayoutAccount(payoutAccount),
        transfer: {
          reference: lockedIntent.paystack_reference,
          status: String(transfer.data.status || "").toLowerCase(),
          amount_kobo: lockedIntent.net_payout_kobo,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Paystack transfer failed";
      await markIntent(
        supabase,
        lockedIntent.id,
        lockId,
        {
          status: "manual_review",
          lock_id: null,
          locked_at: null,
          last_error: message,
        },
        "paystack_transfer_admin_review_required",
        { error: message },
      );
      return json({ ok: false, error: message }, 502);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token")
      ? 401
      : lower.includes("not found")
      ? 404
      : lower.includes("waiting")
      ? 409
      : lower.includes("valid") || lower.includes("required") || lower.includes("before") || lower.includes("confirm") || lower.includes("match")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
