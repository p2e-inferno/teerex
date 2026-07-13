/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { initiatePaystackTransfer, verifyPaystackTransfer } from "../_shared/paystack.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import {
  getDgRedemptionPayoutMethod,
  isPaystackTransferTerminalFailureStatus,
  loadDgRedemptionConfig,
  mapPaystackTransferStatus,
  parseReferenceId,
  paystackTransferUpdateValues,
} from "../_shared/dg-redemption.ts";
import {
  canRetryUsdcFeeTransfer,
  executeUsdcFeeTransfer,
  executeUsdcPayout,
} from "../_shared/dg-redemption-payout.ts";
import { alertAdminDgRedemptionReview } from "../_shared/dg-redemption-notify.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvent(supabase: any, intent: any, adminUserId: string, eventType: string, metadata: Record<string, unknown>) {
  await supabase.from("dg_redemption_events").insert({
    intent_id: intent.id,
    event_type: eventType,
    actor_user_id: adminUserId,
    actor_wallet_address: intent.wallet_address,
    metadata,
  });
}

async function updateLockedIntent(
  supabase: any,
  intent: any,
  lockId: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("dg_redemption_intents")
    .update(values)
    .eq("id", intent.id)
    .eq("lock_id", lockId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Redeem DG retry lock was lost");
  if (String((values as any).status) === "manual_review") {
    await alertAdminDgRedemptionReview({
      supabase,
      intentId: data.id,
      reason: String((values as any).last_error || "retry_manual_review"),
      actorUserId: data.user_id,
      logPrefix: "retry-dg-redemption-payout",
    });
  }
  return data;
}

function isMissingPaystackTransfer(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /not found|does not exist|reference/i.test(message);
}

function needsFreshPaystackReference(intent: any): boolean {
  if (["failed", "payout_processing", "payout_pending"].includes(String(intent.status))) return true;
  return String(intent.status) === "manual_review" && isPaystackTransferTerminalFailureStatus(intent.paystack_status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const adminUserId = await ensureAdmin(req.headers);
    const body = await req.json().catch(() => ({}));
    const intentId = String(body.intent_id || body.intentId || "").trim();
    const reconcileOnly = Boolean(body.reconcile_only || body.reconcileOnly);
    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (reconcileOnly) {
      const { data: existing, error: existingError } = await supabase
        .from("dg_redemption_intents")
        .select("id,status")
        .eq("id", intentId)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (existing?.status === "manual_review") {
        return json({ ok: false, error: "Payout has not started yet. Approve or retry the payout instead." }, 400);
      }
    }

    const lockId = crypto.randomUUID();
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: intent, error: lockError } = await supabase.rpc("acquire_dg_redemption_retry_lock", {
      p_intent_id: intentId,
      p_admin_user_id: adminUserId,
      p_lock_id: lockId,
      p_stale_before: staleBefore,
    });
    if (lockError) throw new Error(lockError.message);
    if (!intent) {
      const { data: existing, error: existingError } = await supabase
        .from("dg_redemption_intents")
        .select("id,status,tx_hash")
        .eq("id", intentId)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (!existing) return json({ ok: false, error: "Redeem DG request was not found" }, 404);
      if (!existing.tx_hash) return json({ ok: false, error: "DG transfer has not been validated" }, 400);
      return json({ ok: false, error: "Redeem DG request is not retryable" }, 400);
    }

    if (getDgRedemptionPayoutMethod(intent) === "usdc") {
      const [config, network] = await Promise.all([
        loadDgRedemptionConfig(supabase),
        validateChain(supabase, intent.chain_id),
      ]);
      if (!network) {
        await updateLockedIntent(supabase, intent, lockId, {
          status: intent.status,
          lock_id: null,
          locked_at: null,
          last_error: "Network not found or inactive",
        });
        return json({ ok: false, error: "Network not found or inactive" }, 404);
      }
      if (String(intent.status) === "completed") {
        if (!canRetryUsdcFeeTransfer(intent)) {
          await updateLockedIntent(supabase, intent, lockId, {
            status: intent.status,
            lock_id: null,
            locked_at: null,
          });
          return json({ ok: false, error: "USDC fee transfer is not retryable" }, 400);
        }
        if (reconcileOnly && !intent.fee_transfer_tx_hash) {
          await updateLockedIntent(supabase, intent, lockId, {
            status: intent.status,
            lock_id: null,
            locked_at: null,
          });
          return json({ ok: false, error: "USDC fee transfer has not started yet. Retry the fee sweep instead." }, 400);
        }

        try {
          const feeResult = await executeUsdcFeeTransfer({
            supabase,
            intent,
            lockId,
            actorUserId: adminUserId,
            network,
            config,
            allowManualReviewRetry: !reconcileOnly,
            allowResendAfterRevert: !reconcileOnly,
          });
          await logEvent(supabase, feeResult.intent, adminUserId, reconcileOnly ? "admin_reconcile_usdc_fee_transfer" : "admin_retry_usdc_fee_transfer", {
            status: feeResult.status,
            fee_transfer_tx_hash: feeResult.txHash,
            error: feeResult.error || null,
          });
          return json({
            ok: true,
            status: feeResult.intent.status,
            redemption: feeResult.intent,
            fee_transfer: {
              status: feeResult.status,
              tx_hash: feeResult.txHash,
              error: feeResult.error || null,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "USDC fee transfer failed";
          await updateLockedIntent(supabase, intent, lockId, {
            status: intent.status,
            lock_id: null,
            locked_at: null,
            fee_transfer_last_error: message,
          });
          await logEvent(supabase, intent, adminUserId, "admin_retry_usdc_fee_transfer_failed", { error: message });
          return json({ ok: false, error: message }, 502);
        }
      }
      if (reconcileOnly && !intent.payout_tx_hash) {
        await updateLockedIntent(supabase, intent, lockId, {
          status: intent.status,
          lock_id: null,
          locked_at: null,
        });
        return json({ ok: false, error: "USDC payout has not started yet. Retry the payout instead." }, 400);
      }

      try {
        const result = await executeUsdcPayout({
          supabase,
          intent,
          lockId,
          actorUserId: adminUserId,
          network,
          config,
          allowResendAfterRevert: !reconcileOnly,
        });
        let feeResult = null;
        if (result.status === "completed" && canRetryUsdcFeeTransfer(result.intent)) {
          try {
            feeResult = await executeUsdcFeeTransfer({
              supabase,
              intent: result.intent,
              actorUserId: adminUserId,
              network,
              config,
              allowManualReviewRetry: !reconcileOnly,
              allowResendAfterRevert: !reconcileOnly,
            });
          } catch (error) {
            await logEvent(supabase, result.intent, adminUserId, "admin_retry_usdc_fee_transfer_failed", {
              error: error instanceof Error ? error.message : "USDC fee transfer failed",
            });
          }
        }
        await logEvent(supabase, intent, adminUserId, reconcileOnly ? "admin_reconcile_usdc_payout" : "admin_retry_usdc_payout", {
          status: result.status,
          payout_tx_hash: result.txHash,
          fee_transfer_status: feeResult?.status || null,
          fee_transfer_tx_hash: feeResult?.txHash || null,
          error: result.error || null,
        });
        return json({ ok: true, status: result.status, redemption: feeResult?.intent || result.intent });
      } catch (error) {
        const message = error instanceof Error ? error.message : "USDC payout failed";
        await updateLockedIntent(supabase, intent, lockId, {
          status: intent.status,
          lock_id: null,
          locked_at: null,
          last_error: message,
        });
        await logEvent(supabase, intent, adminUserId, "admin_retry_usdc_payout_failed", { error: message });
        return json({ ok: false, error: message }, 502);
      }
    }

    let rotateReference = needsFreshPaystackReference(intent);

    try {
      const verified = await verifyPaystackTransfer(intent.paystack_reference);
      const paystackStatus = String(verified.data.status || "").toLowerCase();
      const verifiedStatus = mapPaystackTransferStatus({ status: paystackStatus });
      if (verifiedStatus !== "failed") {
        const updated = await updateLockedIntent(
          supabase,
          intent,
          lockId,
          paystackTransferUpdateValues({ transfer: verified.data }),
        );
        await logEvent(supabase, intent, adminUserId, "admin_retry_reconciled_paystack", { paystack_transfer: verified.data });
        return json({ ok: true, status: updated.status, redemption: updated });
      }
      if (reconcileOnly) {
        const updated = await updateLockedIntent(
          supabase,
          intent,
          lockId,
          paystackTransferUpdateValues({ transfer: verified.data, failedStatus: "manual_review" }),
        );
        await logEvent(supabase, intent, adminUserId, "admin_reconcile_paystack_failed", { paystack_transfer: verified.data });
        return json({ ok: true, status: updated.status, redemption: updated });
      }
      rotateReference = true;
    } catch (error) {
      if (reconcileOnly && isMissingPaystackTransfer(error)) {
        const updated = await updateLockedIntent(supabase, intent, lockId, {
          status: "manual_review",
          lock_id: null,
          locked_at: null,
          last_error: "paystack_transfer_not_found",
        });
        await logEvent(supabase, intent, adminUserId, "admin_reconcile_paystack_missing", { error: "paystack_transfer_not_found" });
        return json({ ok: true, status: updated.status, redemption: updated });
      }
      if (!isMissingPaystackTransfer(error)) {
        const message = error instanceof Error ? error.message : "Could not verify Paystack transfer";
        await updateLockedIntent(supabase, intent, lockId, {
          status: intent.status,
          lock_id: null,
          locked_at: null,
          last_error: message,
        });
        return json({ ok: false, error: message }, 502);
      }
    }

    const { data: payoutAccount, error: payoutError } = await supabase
      .from("user_payout_accounts")
      .select("*")
      .eq("id", intent.payout_account_id)
      .eq("status", "verified")
      .maybeSingle();
    if (payoutError) throw new Error(payoutError.message);
    if (!payoutAccount?.provider_recipient_code) {
      await updateLockedIntent(supabase, intent, lockId, {
        status: intent.status,
        lock_id: null,
        locked_at: null,
        last_error: "Saved bank account is no longer available",
      });
      return json({ ok: false, error: "Saved bank account is no longer available" }, 400);
    }

    const reference = rotateReference
      ? parseReferenceId("dgr_retry")
      : intent.paystack_reference;
    if (reference !== intent.paystack_reference) {
      await updateLockedIntent(supabase, intent, lockId, {
        paystack_reference: reference,
        paystack_status: null,
        paystack_transfer_code: null,
        paystack_transfer_id: null,
        last_error: null,
      });
      await logEvent(supabase, intent, adminUserId, "admin_retry_reference_rotated", {
        previous_reference: intent.paystack_reference,
        new_reference: reference,
      });
    }

    try {
      const transfer = await initiatePaystackTransfer({
        source: "balance",
        amount: Number(intent.net_payout_kobo),
        recipient: payoutAccount.provider_recipient_code,
        reference,
        reason: "Event participant payout",
        currency: "NGN",
      });
      const updated = await updateLockedIntent(
        supabase,
        intent,
        lockId,
        paystackTransferUpdateValues({ transfer: transfer.data, failedStatus: "manual_review" }),
      );
      await logEvent(supabase, intent, adminUserId, "admin_retry_paystack_transfer", { paystack_transfer: transfer.data });

      return json({ ok: true, status: updated.status, redemption: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Paystack transfer failed";
      await updateLockedIntent(supabase, intent, lockId, {
        status: "manual_review",
        lock_id: null,
        locked_at: null,
        last_error: message,
      });
      await logEvent(supabase, intent, adminUserId, "admin_retry_paystack_transfer_failed", { error: message });
      return json({ ok: false, error: message }, 502);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("unauthorized")
      ? 403
      : lower.includes("authorization")
      ? 401
      : lower.includes("not found")
      ? 404
      : lower.includes("required") || lower.includes("retryable") || lower.includes("validated")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
