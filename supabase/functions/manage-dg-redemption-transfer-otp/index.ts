/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import {
  finalizePaystackTransfer,
  resendPaystackTransferOtp,
  verifyPaystackTransfer,
  type PaystackTransferData,
  type PaystackTransferResponse,
} from "../_shared/paystack.ts";
import { paystackTransferUpdateValues } from "../_shared/dg-redemption.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeOtp(value: unknown): string {
  return String(value || "").replace(/\D/g, "").trim();
}

function isStalePaystackOtpStateError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("not currently awaiting otp") || normalized.includes("not awaiting otp");
}

function reconciledOtpMessage(status: unknown): string {
  if (String(status || "") === "completed") return "Paystack transfer was already completed";
  return "Paystack transfer state was refreshed";
}

function paystackOtpErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("velocity") || normalized.includes("too many")) return 429;
  if (
    normalized.includes("invalid") ||
    normalized.includes("incorrect") ||
    normalized.includes("wrong") ||
    normalized.includes("expired")
  ) return 400;
  return 502;
}

async function logEvent(
  supabase: any,
  intent: any,
  adminUserId: string,
  eventType: string,
  metadata: Record<string, unknown>,
) {
  await supabase.from("dg_redemption_events").insert({
    intent_id: intent.id,
    event_type: eventType,
    actor_user_id: adminUserId,
    actor_wallet_address: intent.wallet_address,
    metadata,
  });
}

async function reconcileStalePaystackOtpState(
  supabase: any,
  intent: any,
  adminUserId: string,
  errorMessage: string,
) {
  if (!intent.paystack_reference) return null;

  const verified = await verifyPaystackTransfer(intent.paystack_reference);
  const { data: updated, error } = await supabase
    .from("dg_redemption_intents")
    .update(paystackTransferUpdateValues({ transfer: verified.data, failedStatus: "manual_review" }))
    .eq("id", intent.id)
    .eq("status", "manual_review")
    .eq("paystack_status", "otp")
    .eq("paystack_transfer_code", intent.paystack_transfer_code)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updated) return null;

  await logEvent(supabase, updated, adminUserId, "admin_reconciled_stale_paystack_otp", {
    error: errorMessage,
    paystack_transfer: verified.data,
  });

  return updated;
}

async function verifiedTransferAfterFinalize(
  intent: any,
  finalized: PaystackTransferResponse,
): Promise<PaystackTransferData> {
  if (!intent.paystack_reference) return finalized.data;

  try {
    const verified = await verifyPaystackTransfer(intent.paystack_reference);
    return verified.data;
  } catch (error) {
    console.warn(
      "[manage-dg-redemption-transfer-otp] Paystack post-finalize verification failed",
      error instanceof Error ? error.message : error,
    );
    return finalized.data;
  }
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
    const action = String(body.action || "").trim();
    const otp = normalizeOtp(body.otp);

    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);
    if (!["finalize", "resend"].includes(action)) return json({ ok: false, error: "Unsupported OTP action" }, 400);
    if (action === "finalize" && otp.length < 4) {
      return json({ ok: false, error: "Enter the Paystack OTP" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: intent, error: intentError } = await supabase
      .from("dg_redemption_intents")
      .select("*")
      .eq("id", intentId)
      .maybeSingle();

    if (intentError) throw new Error(intentError.message);
    if (!intent) return json({ ok: false, error: "Redeem DG request was not found" }, 404);
    if (!intent.tx_hash) return json({ ok: false, error: "DG transfer has not been submitted" }, 400);
    if (String(intent.status) !== "manual_review" || String(intent.paystack_status || "").toLowerCase() !== "otp") {
      return json({ ok: false, error: "Redeem DG request is not waiting for Paystack OTP" }, 400);
    }
    if (!intent.paystack_transfer_code) {
      return json({ ok: false, error: "Paystack transfer code is missing" }, 400);
    }

    if (action === "resend") {
      try {
        const result = await resendPaystackTransferOtp({
          transfer_code: intent.paystack_transfer_code,
          reason: "transfer",
        });
        await logEvent(supabase, intent, adminUserId, "admin_resent_paystack_transfer_otp", {
          paystack_transfer_code: intent.paystack_transfer_code,
          message: result.message,
        });
        return json({ ok: true, message: result.message });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to resend Paystack transfer OTP";
        if (isStalePaystackOtpStateError(message)) {
          try {
            const reconciled = await reconcileStalePaystackOtpState(supabase, intent, adminUserId, message);
            if (reconciled) {
              return json({
                ok: true,
                status: reconciled.status,
                redemption: reconciled,
                message: reconciledOtpMessage(reconciled.status),
              });
            }
          } catch (reconcileError) {
            console.warn(
              "[manage-dg-redemption-transfer-otp] Paystack OTP resend reconciliation failed",
              reconcileError instanceof Error ? reconcileError.message : reconcileError,
            );
          }
        }

        await supabase
          .from("dg_redemption_intents")
          .update({
            last_error: message,
            lock_id: null,
            locked_at: null,
          })
          .eq("id", intent.id)
          .eq("status", "manual_review")
          .eq("paystack_status", "otp");
        await logEvent(supabase, intent, adminUserId, "admin_resend_paystack_transfer_otp_failed", {
          error: message,
        });
        return json({ ok: false, error: message }, paystackOtpErrorStatus(message));
      }
    }

    let finalized: PaystackTransferResponse;
    try {
      finalized = await finalizePaystackTransfer({
        transfer_code: intent.paystack_transfer_code,
        otp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to finalize Paystack transfer";
      if (isStalePaystackOtpStateError(message)) {
        try {
          const reconciled = await reconcileStalePaystackOtpState(supabase, intent, adminUserId, message);
          if (reconciled) {
            return json({
              ok: true,
              status: reconciled.status,
              redemption: reconciled,
              message: reconciledOtpMessage(reconciled.status),
            });
          }
        } catch (reconcileError) {
          console.warn(
            "[manage-dg-redemption-transfer-otp] Paystack OTP state reconciliation failed",
            reconcileError instanceof Error ? reconcileError.message : reconcileError,
          );
        }
      }

      await supabase
        .from("dg_redemption_intents")
        .update({
          last_error: message,
          lock_id: null,
          locked_at: null,
        })
        .eq("id", intent.id)
        .eq("status", "manual_review")
        .eq("paystack_status", "otp");
      await logEvent(supabase, intent, adminUserId, "admin_finalize_paystack_transfer_otp_failed", {
        error: message,
      });
      return json({ ok: false, error: message }, paystackOtpErrorStatus(message));
    }

    const transfer = await verifiedTransferAfterFinalize(intent, finalized);
    const { data: updated, error: updateError } = await supabase
      .from("dg_redemption_intents")
      .update(paystackTransferUpdateValues({ transfer, failedStatus: "manual_review" }))
      .eq("id", intent.id)
      .eq("status", "manual_review")
      .eq("paystack_status", "otp")
      .eq("paystack_transfer_code", intent.paystack_transfer_code)
      .select("*")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) return json({ ok: false, error: "Redeem DG request OTP state changed. Refresh and try again." }, 409);

    await logEvent(supabase, updated, adminUserId, "admin_finalized_paystack_transfer_otp", {
      previous_status: intent.status,
      paystack_finalize_response: finalized.data,
      paystack_transfer: transfer,
    });

    return json({ ok: true, status: updated.status, redemption: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("unauthorized")
      ? 403
      : lower.includes("authorization")
      ? 401
      : lower.includes("not found")
      ? 404
      : lower.includes("required") || lower.includes("unsupported") || lower.includes("submitted") || lower.includes("waiting") || lower.includes("missing") || lower.includes("otp")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
