/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const reference = String(body.reference || url.searchParams.get("reference") || "").trim();
    if (!reference) return json({ ok: false, error: "reference_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: order } = await supabase
      .from("ticket_pass_orders")
      .select("id, pass_id, buyer_id, status, token_id, grant_dispense_txn_hash, last_error, chain_id, lock_address, dispensed_at")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (!order) return json({ ok: false, error: "order_not_found" }, 404);
    // Only the buyer (or creator) may poll their order.
    if (order.buyer_id && order.buyer_id !== privyUserId) {
      const { data: pass } = await supabase
        .from("ticket_passes")
        .select("creator_id")
        .eq("id", order.pass_id)
        .maybeSingle();
      if (pass?.creator_id !== privyUserId) return json({ ok: false, error: "forbidden" }, 403);
    }

    return json({
      ok: true,
      status: order.status,
      token_id: order.token_id,
      txn_hash: order.grant_dispense_txn_hash,
      last_error: order.last_error,
      chain_id: order.chain_id,
      lock_address: order.lock_address,
      dispensed_at: order.dispensed_at,
    }, 200);
  } catch (err: any) {
    console.error("[get-ticket-pass-order-status]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
