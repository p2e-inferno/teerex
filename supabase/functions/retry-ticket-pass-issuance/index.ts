/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import {
  acquireTicketPassIssuanceLock,
  issueTicketPassFromVerifiedOrder,
  releaseTicketPassIssuanceLock,
} from "../_shared/ticket-pass-issuance.ts";

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
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const reference = String(body.reference || "").trim();
    const orderId = String(body.order_id || "").trim();
    if (!reference && !orderId) return json({ ok: false, error: "reference_or_order_id_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let q = supabase
      .from("ticket_pass_orders")
      .select("id, pass_id, buyer_id, creator_id, status, payment_reference, order_ref, buyer_address, chain_id, lock_address, token_id, grant_dispense_txn_hash, gateway_response, issuance_attempts, verified_at");
    q = orderId ? q.eq("id", orderId) : q.eq("payment_reference", reference);
    const { data: order } = await q.maybeSingle();

    if (!order) return json({ ok: false, error: "order_not_found" }, 404);

    // Only the buyer or the pass creator may retry.
    if (order.buyer_id !== privyUserId && order.creator_id !== privyUserId) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const upperStatus = String(order.status).toUpperCase();
    if (upperStatus === "DISPENSED" && order.token_id) {
      return json({ ok: true, already_issued: true, tokenId: order.token_id, txHash: order.grant_dispense_txn_hash }, 200);
    }
    if (upperStatus === "REFUNDED" || upperStatus.startsWith("REFUND_")) {
      return json({ ok: false, error: "refund_already_started" }, 400);
    }
    // Only fulfil orders that were already paid/verified — never bypass payment.
    if (upperStatus !== "PAID" && upperStatus !== "FAILED") {
      return json({ ok: false, error: "order_not_payable" }, 400);
    }

    const { data: pass } = await supabase
      .from("ticket_passes")
      .select("id, chain_id, lock_address, controller_address, status")
      .eq("id", order.pass_id)
      .maybeSingle();
    if (!pass) return json({ ok: false, error: "pass_not_found" }, 404);

    const currentAttempts = (order.issuance_attempts ?? 0) + 1;
    const { lockId } = await acquireTicketPassIssuanceLock({ supabase, orderId: order.id, currentAttempts });
    if (!lockId) return json({ ok: true, processing: true, message: "issuance_already_in_progress" }, 200);

    try {
      const issued = await issueTicketPassFromVerifiedOrder({ supabase, order, pass, lockId });
      return json(issued, 200);
    } catch (e: any) {
      await releaseTicketPassIssuanceLock({ supabase, orderId: order.id, lockId, lastError: e?.message || "issuance_failed" });
      return json({ ok: false, error: e?.message || "issuance_failed" }, 400);
    }
  } catch (err: any) {
    console.error("[retry-ticket-pass-issuance]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
