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
    const limit = Math.min(Number((body.limit ?? url.searchParams.get("limit")) || 50), 200);
    const offset = Math.max(Number((body.offset ?? url.searchParams.get("offset")) || 0), 0);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("ticket_pass_orders")
      .select(`
        id, pass_id, status, payment_provider, payment_reference, amount_fiat, fiat_symbol, chain_id, lock_address,
        token_id, grant_dispense_txn_hash, refund_status, refund_error, refund_requested_at,
        refund_processed_at, refund_last_synced_at, created_at, dispensed_at,
        ticket_passes ( id, title, image_url, payout_token_symbol, token_per_copy_wei, eth_per_copy_wei, token_decimals, key_expiration_duration_seconds, target_event_address, controller_address )
      `)
      .eq("buyer_id", privyUserId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true, orders: data ?? [] }, 200);
  } catch (err: any) {
    console.error("[list-my-ticket-pass-orders]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
