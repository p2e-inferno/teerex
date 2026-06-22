/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { initiatePaystackTransfer } from "../_shared/paystack.ts";
import {
  loadDgRedemptionConfig,
  paystackTransferUpdateValues,
  publicPayoutAccount,
  validateDgTransfer,
  withRedemptionPricingDefaults,
} from "../_shared/dg-redemption.ts";

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
  return data;
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

    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);
    if (!/^0x([A-Fa-f0-9]{64})$/.test(txHash)) {
      return json({ ok: false, error: "Enter a valid transaction hash" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
    if (!network) return json({ ok: false, error: "Network not found or inactive" }, 404);

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
        reason: "Redeem DG reward",
        currency: "NGN",
      });
      const transferValues = paystackTransferUpdateValues({ transfer: transfer.data });
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
          status: "failed",
          lock_id: null,
          locked_at: null,
          last_error: message,
        },
        "paystack_transfer_failed",
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
      : lower.includes("valid") || lower.includes("required")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
