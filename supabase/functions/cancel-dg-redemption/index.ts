/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

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

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const intentId = String(body.intent_id || body.intentId || "").trim();

    if (!intentId) {
      return json({ ok: false, error: "Redeem DG request id is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch current status to check eligibility
    const { data: existing, error: fetchError } = await supabase
      .from("dg_redemption_intents")
      .select("status, wallet_address")
      .eq("id", intentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!existing) {
      return json({ ok: false, error: "Redeem DG request was not found" }, 404);
    }

    if (existing.status !== "awaiting_transfer" && existing.status !== "expired") {
      return json({
        ok: false,
        error: `Cannot cancel a request that is currently in '${existing.status}' status`,
      }, 400);
    }

    // Perform cancel update
    const { data: updated, error: updateError } = await supabase
      .from("dg_redemption_intents")
      .update({
        status: "cancelled",
        last_error: "cancelled_by_user",
      })
      .eq("id", intentId)
      .eq("user_id", userId)
      .in("status", ["awaiting_transfer", "expired"])
      .select("*")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return json({ ok: false, error: "Failed to cancel the request" }, 500);
    }

    // Insert redemption event for logging audit trail
    await supabase.from("dg_redemption_events").insert({
      intent_id: intentId,
      event_type: "cancelled_by_user",
      actor_user_id: userId,
      actor_wallet_address: updated.wallet_address,
      metadata: { source: "user_cancel_button" },
    });

    return json({
      ok: true,
      status: "cancelled",
      message: "Redeem DG request cancelled successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token") ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});
