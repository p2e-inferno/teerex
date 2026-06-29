/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import {
  getExpectedPaystackAmountKobo,
  verifyPaystackAmountAndCurrency,
  verifyPaystackTransaction,
} from "../_shared/paystack.ts";
import { normalizeEmail } from "../_shared/email-utils.ts";
import { validateUserWallet, verifyPrivyToken } from "../_shared/privy.ts";
import {
  acquireTicketPassIssuanceLock,
  issueTicketPassFromVerifiedOrder,
  orderRefFromReference,
  releaseTicketPassIssuanceLock,
} from "../_shared/ticket-pass-issuance.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readMetadataField(metadata: any, key: string): string | null {
  const direct = metadata?.[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const fields = Array.isArray(metadata?.custom_fields) ? metadata.custom_fields : [];
  for (const f of fields) {
    if (String(f?.variable_name || "").toLowerCase() === key.toLowerCase()) {
      const v = String(f?.value || "").trim();
      if (v) return v;
    }
  }
  return null;
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
    if (!reference) return json({ ok: false, error: "reference_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const verifyPayload = await verifyPaystackTransaction(reference);
    const verifyData = verifyPayload?.data ?? {};
    if (String(verifyData?.status || "").toLowerCase() !== "success") {
      return json({ ok: false, error: "status_not_success" }, 400);
    }

    const metadata = verifyData?.metadata ?? {};
    let passId = readMetadataField(metadata, "pass_id");
    let buyerWallet = readMetadataField(metadata, "user_wallet_address");
    const buyerEmailRaw = readMetadataField(metadata, "user_email") || verifyData?.customer?.email || null;
    const buyerEmail = buyerEmailRaw ? normalizeEmail(String(buyerEmailRaw)) : null;

    const { data: existingOrder } = await supabase
      .from("ticket_pass_orders")
      .select("id, pass_id, status, payment_provider, buyer_address, token_id, grant_dispense_txn_hash, gateway_response, issuance_attempts, order_ref, verified_at")
      .eq("payment_reference", reference)
      .maybeSingle();

    // Refunding/refunded orders must never be reset to PAID and re-delivered.
    const existingStatus = String(existingOrder?.status || "").toUpperCase();
    if (existingOrder && existingStatus === "REFUNDED") {
      return json({ ok: true, refunded: true }, 200);
    }
    if (existingOrder && existingStatus.startsWith("REFUND_")) {
      return json({ ok: true, refund_pending: true, status: existingStatus }, 200);
    }

    if (!passId && existingOrder?.pass_id) passId = String(existingOrder.pass_id);
    if (!buyerWallet && existingOrder?.buyer_address) buyerWallet = String(existingOrder.buyer_address);

    if (existingOrder?.pass_id && passId && String(existingOrder.pass_id) !== String(passId)) {
      return json({ ok: false, error: "pass_reference_mismatch" }, 400);
    }
    if (existingOrder?.buyer_address && buyerWallet &&
        String(existingOrder.buyer_address).toLowerCase() !== String(buyerWallet).toLowerCase()) {
      return json({ ok: false, error: "wallet_reference_mismatch" }, 400);
    }

    if (!passId) return json({ ok: false, error: "missing_pass_id_in_metadata" }, 400);
    if (!buyerWallet) return json({ ok: false, error: "missing_wallet_in_metadata" }, 400);

    const validatedWallet = await validateUserWallet(privyUserId, buyerWallet, "wallet_not_authorized_for_user");

    const { data: pass } = await supabase
      .from("ticket_passes")
      .select("id, creator_id, chain_id, lock_address, controller_address, price_fiat, price_fiat_kobo, fiat_symbol, status, issuance_enabled")
      .eq("id", passId)
      .maybeSingle();

    if (!pass) return json({ ok: false, error: "pass_not_found" }, 404);

    // Amount + currency verification.
    const expectedFiat = Number(pass.price_fiat ?? 0);
    const expectedCurrency = String(pass.fiat_symbol || "NGN").toUpperCase();
    const expectedAmount = getExpectedPaystackAmountKobo({
      priceFiatKobo: pass.price_fiat_kobo,
      priceFiat: expectedFiat,
    });
    if (!Number.isFinite(expectedFiat) || expectedFiat <= 0) return json({ ok: false, error: "pass_price_invalid" }, 400);

    const issues = verifyPaystackAmountAndCurrency({
      paystackAmountKobo: verifyData?.amount,
      paystackCurrency: verifyData?.currency,
      expectedAmountKobo: expectedAmount,
      expectedCurrency,
    });
    if (issues.includes("currency_mismatch")) return json({ ok: false, error: "currency_mismatch" }, 400);
    if (issues.includes("amount_mismatch")) return json({ ok: false, error: "amount_mismatch" }, 400);

    const verifySummary = {
      id: verifyData?.id,
      status: verifyData?.status,
      reference: verifyData?.reference,
      amount: verifyData?.amount,
      currency: verifyData?.currency,
      paid_at: verifyData?.paid_at,
    };
    const orderRef = orderRefFromReference(reference);

    // Upsert/update the order to PAID (idempotent on payment_reference).
    if (!existingOrder) {
      const { error: insertError } = await supabase.from("ticket_pass_orders").insert({
        pass_id: pass.id,
        creator_id: pass.creator_id,
        buyer_id: privyUserId,
        buyer_address: validatedWallet,
        buyer_email: buyerEmail,
        payment_provider: "paystack",
        payment_reference: reference,
        order_ref: orderRef,
        amount_fiat: expectedFiat,
        fiat_symbol: expectedCurrency,
        chain_id: pass.chain_id,
        lock_address: pass.lock_address,
        status: "PAID",
        gateway_response: { paystack_verify: verifySummary },
        verified_at: new Date().toISOString(),
      });
      if (insertError) return json({ ok: false, error: insertError.message }, 400);
    } else if (String(existingOrder.status).toUpperCase() !== "DISPENSED") {
      await supabase
        .from("ticket_pass_orders")
        .update({
          status: "PAID",
          buyer_id: privyUserId,
          buyer_address: validatedWallet,
          order_ref: existingOrder.order_ref || orderRef,
          amount_fiat: expectedFiat,
          fiat_symbol: expectedCurrency,
          gateway_response: { ...(existingOrder.gateway_response || {}), paystack_verify: verifySummary },
          verified_at: new Date().toISOString(),
        })
        .eq("id", existingOrder.id);
    }

    // Reload the canonical order row.
    const { data: order } = await supabase
      .from("ticket_pass_orders")
      .select("id, pass_id, status, payment_provider, payment_reference, order_ref, buyer_address, chain_id, lock_address, token_id, grant_dispense_txn_hash, gateway_response, issuance_attempts, verified_at")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (!order) return json({ ok: false, error: "order_not_found" }, 404);
    if (String(order.payment_provider) !== "paystack") return json({ ok: false, error: "unsupported_payment_provider" }, 400);

    // Idempotent fast-path.
    if (String(order.status).toUpperCase() === "DISPENSED" && order.token_id) {
      return json({ ok: true, already_issued: true, tokenId: order.token_id, txHash: order.grant_dispense_txn_hash }, 200);
    }

    // Acquire issuance lock and fulfil atomically.
    const currentAttempts = (order.issuance_attempts ?? 0) + 1;
    const { lockId } = await acquireTicketPassIssuanceLock({ supabase, orderId: order.id, currentAttempts });
    if (!lockId) {
      return json({ ok: true, processing: true, message: "issuance_already_in_progress" }, 200);
    }

    try {
      const issued = await issueTicketPassFromVerifiedOrder({ supabase, order, pass, lockId });
      return json(issued, 200);
    } catch (e: any) {
      await releaseTicketPassIssuanceLock({
        supabase,
        orderId: order.id,
        lockId,
        lastError: e?.message || "issuance_failed",
      });
      return json({ ok: false, error: e?.message || "issuance_failed" }, 400);
    }
  } catch (err: any) {
    console.error("[confirm-ticket-pass-paystack]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
