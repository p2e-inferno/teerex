/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import {
  canApplyPaystackTransferStatus,
  mapPaystackTransferStatus,
  paystackTransferUpdateValues,
  verifyPaystackWebhookSignature,
} from "../_shared/dg-redemption.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");
    if (!(await verifyPaystackWebhookSignature(rawBody, signature))) {
      return json({ ok: false, error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(rawBody);
    const event = String(payload?.event || "");
    const data = payload?.data || {};
    const reference = String(data.reference || "").trim();
    if (!reference || !event.startsWith("transfer.")) {
      return json({ ok: true, ignored: true });
    }

    const status = mapPaystackTransferStatus({ event, status: data.status });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: intent, error: intentError } = await supabase
      .from("dg_redemption_intents")
      .select("*")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (intentError) throw new Error(intentError.message);
    if (!intent) return json({ ok: true, ignored: true });
    if (!canApplyPaystackTransferStatus({ currentStatus: intent.status, nextStatus: status, event })) {
      await supabase.from("dg_redemption_events").insert({
        intent_id: intent.id,
        event_type: "paystack_webhook_ignored",
        actor_user_id: intent.user_id,
        actor_wallet_address: intent.wallet_address,
        metadata: { event, paystack_transfer: data, mapped_status: status, current_status: intent.status },
      });
      return json({ ok: true, ignored: true, status: intent.status });
    }

    const { data: updated, error } = await supabase
      .from("dg_redemption_intents")
      .update(paystackTransferUpdateValues({ transfer: data, event }))
      .eq("id", intent.id)
      .eq("status", intent.status)
      .select("id,user_id,wallet_address,status")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) return json({ ok: true, ignored: true, status: intent.status });

    await supabase.from("dg_redemption_events").insert({
      intent_id: updated.id,
      event_type: "paystack_webhook",
      actor_user_id: updated.user_id,
      actor_wallet_address: updated.wallet_address,
      metadata: { event, paystack_transfer: data, mapped_status: status },
    });

    return json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return json({ ok: false, error: message }, 500);
  }
});
