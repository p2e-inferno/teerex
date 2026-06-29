/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { isDgRedemptionManuallyPayable } from "../_shared/dg-redemption.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MANUAL_PAID_STATUSES = ["failed", "manual_review", "payout_pending", "payout_processing"];

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
    const paymentReference = String(body.payment_reference || body.paymentReference || "").trim();
    const note = String(body.note || "").trim();

    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);
    if (action !== "mark_paid") return json({ ok: false, error: "Unsupported resolution action" }, 400);
    if (!paymentReference && !note) {
      return json({ ok: false, error: "Add a manual payment reference or note" }, 400);
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
    if (!MANUAL_PAID_STATUSES.includes(String(intent.status))) {
      return json({ ok: false, error: "Redeem DG request is not ready for manual payment resolution" }, 400);
    }
    if (!isDgRedemptionManuallyPayable(intent)) {
      return json({ ok: false, error: "Redeem DG request still has an active Paystack transfer" }, 400);
    }

    const completedAt = new Date().toISOString();
    let updateQuery = supabase
      .from("dg_redemption_intents")
      .update({
        status: "completed",
        completed_at: completedAt,
        lock_id: null,
        locked_at: null,
        last_error: null,
        paystack_status: paymentReference ? "manual_paid" : intent.paystack_status,
      })
      .eq("id", intent.id)
      .not("tx_hash", "is", null)
      .eq("status", intent.status);

    updateQuery = intent.paystack_status === null || intent.paystack_status === undefined
      ? updateQuery.is("paystack_status", null)
      : updateQuery.eq("paystack_status", intent.paystack_status);
    updateQuery = intent.paystack_transfer_code === null || intent.paystack_transfer_code === undefined
      ? updateQuery.is("paystack_transfer_code", null)
      : updateQuery.eq("paystack_transfer_code", intent.paystack_transfer_code);
    updateQuery = intent.paystack_transfer_id === null || intent.paystack_transfer_id === undefined
      ? updateQuery.is("paystack_transfer_id", null)
      : updateQuery.eq("paystack_transfer_id", intent.paystack_transfer_id);

    const { data: updated, error: updateError } = await updateQuery.select("*").maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) return json({ ok: false, error: "Redeem DG request could not be resolved" }, 409);

    await supabase.from("dg_redemption_events").insert({
      intent_id: updated.id,
      event_type: "admin_marked_manual_paid",
      actor_user_id: adminUserId,
      actor_wallet_address: updated.wallet_address,
      metadata: {
        previous_status: intent.status,
        previous_last_error: intent.last_error || null,
        payment_reference: paymentReference || null,
        note: note || null,
      },
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
      : lower.includes("required") || lower.includes("unsupported") || lower.includes("submitted") || lower.includes("resolved") || lower.includes("reference") || lower.includes("active paystack")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
