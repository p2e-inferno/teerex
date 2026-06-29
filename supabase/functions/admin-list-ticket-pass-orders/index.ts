/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";

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
    if (req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

    try {
      await ensureAdmin(req.headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: message }, message.startsWith("unauthorized") ? 403 : 401);
    }

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase
      .from("ticket_pass_orders")
      .select(
        `id, pass_id, creator_id, buyer_id, buyer_address, buyer_email,
         payment_provider, payment_reference, order_ref, amount_fiat, fiat_symbol,
         chain_id, lock_address, status, token_id, grant_dispense_txn_hash,
         refund_status, refund_reference, refund_id, refund_amount_kobo, refund_error,
         refund_requested_at, refund_processed_at, refund_last_synced_at,
         issuance_attempts, last_error, verified_at, dispensed_at, created_at, updated_at,
         pass:ticket_passes(title)`,
        { count: "exact" },
      );

    // Default view is the review queue; an explicit status (or "all") overrides it.
    if (statusParam && statusParam !== "all") {
      query = query.eq("status", statusParam.toUpperCase());
    } else if (!statusParam) {
      query = query.in("status", ["NEEDS_REVIEW", "FAILED", "REFUND_NEEDS_ATTENTION", "REFUND_FAILED"]);
    }

    if (search) {
      query = query.or(
        `payment_reference.ilike.%${search}%,buyer_email.ilike.%${search}%,buyer_address.ilike.%${search}%,order_ref.ilike.%${search}%`,
      );
    }

    query = query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: orders, error, count } = await query;
    if (error) {
      console.error("[admin-list-ticket-pass-orders]", error.message);
      return json({ ok: false, error: "Database error" }, 500);
    }

    return json({
      ok: true,
      orders: orders || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (err: any) {
    console.error("[admin-list-ticket-pass-orders]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 500);
  }
});
