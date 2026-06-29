/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { refundPaystackTransaction, retryPaystackRefundWithCustomerDetails } from "../_shared/paystack.ts";
import {
  acquireTicketPassIssuanceLock,
  issueTicketPassFromVerifiedOrder,
  releaseTicketPassIssuanceLock,
} from "../_shared/ticket-pass-issuance.ts";
import {
  appendPaystackRefundGatewayResponse,
  paystackRefundUpdateValues,
} from "../_shared/ticket-pass-refund.ts";

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

    let adminId: string;
    try {
      adminId = await ensureAdmin(req.headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: message }, message.startsWith("unauthorized") ? 403 : 401);
    }

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || "").trim();
    const action = String(body.action || "").trim();
    const note = body.note ? String(body.note).slice(0, 1000) : null;
    if (!orderId) return json({ ok: false, error: "order_id_required" }, 400);
    if (!["mark_refunded", "mark_externally_resolved", "retry_refund", "retry"].includes(action)) {
      return json({ ok: false, error: "invalid_action" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: order } = await supabase
      .from("ticket_pass_orders")
      .select(
        `id, pass_id, status, payment_reference, order_ref, buyer_address, chain_id, lock_address,
         token_id, grant_dispense_txn_hash, gateway_response, issuance_attempts, verified_at`,
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json({ ok: false, error: "order_not_found" }, 404);

    if (action === "mark_refunded" || action === "mark_externally_resolved") {
      if (!note) return json({ ok: false, error: "resolution_note_required" }, 400);
      const currentStatus = String(order.status).toUpperCase();
      if (currentStatus === "REFUNDED") return json({ ok: true, status: "REFUNDED" });
      if (!currentStatus.startsWith("REFUND_")) {
        return json({ ok: false, error: "refund_resolution_not_allowed_for_order_status" }, 400);
      }
      const resolution = {
        action: "mark_externally_resolved",
        by: adminId,
        note,
        at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("ticket_pass_orders")
        .update({
          status: "REFUNDED",
          refund_status: "processed",
          refund_error: null,
          refund_processed_at: resolution.at,
          refund_last_synced_at: resolution.at,
          last_error: null,
          gateway_response: { ...(order.gateway_response || {}), admin_resolution: resolution },
        })
        .eq("id", orderId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, status: "REFUNDED" });
    }

    if (action === "retry_refund") {
      const currentStatus = String(order.status).toUpperCase();
      if (!["REFUND_FAILED", "REFUND_NEEDS_ATTENTION", "NEEDS_REVIEW"].includes(currentStatus)) {
        return json({ ok: false, error: "order_refund_not_retryable" }, 400);
      }
      if (!order.payment_reference) return json({ ok: false, error: "payment_reference_required" }, 400);

      const details = body.refund_account_details || {};
      const shouldRetryWithDetails = currentStatus === "REFUND_NEEDS_ATTENTION" && order.gateway_response?.paystack_refund?.refund?.id;
      const refund = shouldRetryWithDetails
        ? await retryPaystackRefundWithCustomerDetails({
            refundId: order.gateway_response.paystack_refund.refund.id,
            accountNumber: details.account_number,
            bankId: details.bank_id,
            currency: "NGN",
          })
        : await refundPaystackTransaction({
            reference: order.payment_reference,
            merchantNote: `Admin refund retry for ticket pass order ${order.id}`,
          });

      if (!refund.ok) return json({ ok: false, error: refund.error || "refund_retry_failed" }, 502);

      const values = paystackRefundUpdateValues({ refund: refund.data, markRequested: true });
      const { error } = await supabase
        .from("ticket_pass_orders")
        .update({
          ...values,
          gateway_response: appendPaystackRefundGatewayResponse(order.gateway_response || {}, refund.data, {
            source: "admin_retry_refund",
            by: adminId,
            note,
          }),
        })
        .eq("id", orderId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, status: values.status, refund_status: values.refund_status });
    }

    // action === "retry": re-attempt the atomic grant for a paid-but-undelivered order.
    if (String(order.status).toUpperCase() === "DISPENSED" && order.token_id) {
      return json({ ok: true, already_issued: true, tokenId: order.token_id, txHash: order.grant_dispense_txn_hash });
    }
    if (String(order.status).toUpperCase() === "REFUNDED") {
      return json({ ok: false, error: "order_already_refunded" }, 400);
    }
    if (String(order.status).toUpperCase().startsWith("REFUND_")) {
      return json({ ok: false, error: "refund_already_started" }, 400);
    }

    const { data: pass } = await supabase
      .from("ticket_passes")
      .select("id, chain_id, lock_address, controller_address, status")
      .eq("id", order.pass_id)
      .maybeSingle();
    if (!pass) return json({ ok: false, error: "pass_not_found" }, 404);

    const currentAttempts = (order.issuance_attempts ?? 0) + 1;
    const { lockId } = await acquireTicketPassIssuanceLock({ supabase, orderId: order.id, currentAttempts });
    if (!lockId) return json({ ok: true, processing: true, message: "issuance_already_in_progress" });

    try {
      const issued = await issueTicketPassFromVerifiedOrder({ supabase, order, pass, lockId });
      return json(issued);
    } catch (e: any) {
      await releaseTicketPassIssuanceLock({ supabase, orderId: order.id, lockId, lastError: e?.message || "issuance_failed" });
      return json({ ok: false, error: e?.message || "issuance_failed" }, 400);
    }
  } catch (err: any) {
    console.error("[admin-resolve-ticket-pass-order]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 500);
  }
});
