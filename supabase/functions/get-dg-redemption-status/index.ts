/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { verifyPaystackTransfer } from "../_shared/paystack.ts";
import {
  canApplyPaystackTransferStatus,
  mapPaystackTransferStatus,
  paystackTransferUpdateValues,
  publicDgRedemptionIntent,
} from "../_shared/dg-redemption.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PAYSTACK_RECONCILABLE_STATUSES = new Set([
  "payout_pending",
  "payout_processing",
  "manual_review",
]);

async function reconcilePaystackTransfer(supabase: any, intent: any) {
  if (
    !PAYSTACK_RECONCILABLE_STATUSES.has(String(intent.status || "")) ||
    !intent.paystack_reference
  ) {
    return intent;
  }

  try {
    const verified = await verifyPaystackTransfer(intent.paystack_reference);
    const nextStatus = mapPaystackTransferStatus({ status: verified.data?.status });
    if (!canApplyPaystackTransferStatus({ currentStatus: intent.status, nextStatus })) {
      return intent;
    }

    const { data: updated, error } = await supabase
      .from("dg_redemption_intents")
      .update(paystackTransferUpdateValues({ transfer: verified.data }))
      .eq("id", intent.id)
      .eq("user_id", intent.user_id)
      .eq("status", intent.status)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) return intent;

    await supabase.from("dg_redemption_events").insert({
      intent_id: updated.id,
      event_type: "paystack_transfer_reconciled",
      actor_user_id: updated.user_id,
      actor_wallet_address: updated.wallet_address,
      metadata: { paystack_transfer: verified.data, mapped_status: nextStatus },
    });

    return updated;
  } catch (error) {
    console.warn(
      "[get-dg-redemption-status] Paystack transfer reconciliation failed",
      error instanceof Error ? error.message : error,
    );
    return intent;
  }
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
    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("dg_redemption_intents")
      .select("*")
      .eq("id", intentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return json({ ok: false, error: "Redeem DG request was not found" }, 404);

    const redemption = await reconcilePaystackTransfer(supabase, data);

    return json({ ok: true, redemption: publicDgRedemptionIntent(redemption) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token")
      ? 401
      : lower.includes("not found")
      ? 404
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
