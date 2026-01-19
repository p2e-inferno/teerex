/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { getExpectedPaystackAmountKobo, verifyPaystackAmountAndCurrency, verifyPaystackTransaction } from "../_shared/paystack.ts";
import { normalizeEmail } from "../_shared/email-utils.ts";
import { validateUserWallet, verifyPrivyToken } from "../_shared/privy.ts";
import {
  acquireGamingBundleIssuanceLock,
  issueGamingBundleNftFromPaystackVerify,
  releaseGamingBundleIssuanceLock,
} from "../_shared/gaming-bundle-issuance.ts";

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
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    console.log("[confirm-bundle-paystack] auth ok", { privyUserId });

    const body = await req.json().catch(() => ({}));
    const reference = String(body.reference || "").trim();
    if (!reference) return json({ ok: false, error: "reference_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const verifyPayload = await verifyPaystackTransaction(reference);
    const verifyData = verifyPayload?.data ?? {};
    const verifyStatus = String(verifyData?.status || "").toLowerCase();
    console.log("[confirm-bundle-paystack] paystack verify", {
      reference,
      status: verifyStatus,
      amount: verifyData?.amount,
      currency: verifyData?.currency,
    });
    if (verifyStatus !== "success") return json({ ok: false, error: "status_not_success" }, 400);

    const metadata = verifyData?.metadata ?? {};
    let bundleId = readMetadataField(metadata, "bundle_id");
    let buyerWallet = readMetadataField(metadata, "user_wallet_address");
    const buyerEmailRaw = readMetadataField(metadata, "user_email") || verifyData?.customer?.email || null;
    const buyerEmail = buyerEmailRaw ? normalizeEmail(String(buyerEmailRaw)) : null;

    const { data: existingOrder } = await supabase
      .from("gaming_bundle_orders")
      .select(
        `
        id,bundle_id,
        status,
        fulfillment_method,
        payment_provider,
        payment_reference,
        amount_fiat,
        fiat_symbol,
        chain_id,
        bundle_address,
        nft_recipient_address,
        buyer_address,
        txn_hash,
        token_id,
        gateway_response,
        issuance_attempts,
        issuance_lock_id,
        issuance_locked_at,
        gaming_bundles(bundle_address,chain_id,price_fiat,fiat_symbol,key_expiration_duration_seconds)
        `
      )
      .eq("payment_reference", reference)
      .maybeSingle();

    if (!bundleId && existingOrder?.bundle_id) bundleId = String(existingOrder.bundle_id);
    if (!buyerWallet) {
      buyerWallet = String(existingOrder?.nft_recipient_address || existingOrder?.buyer_address || "");
    }

    if (existingOrder?.bundle_id && bundleId && String(existingOrder.bundle_id) !== String(bundleId)) {
      return json({ ok: false, error: "bundle_reference_mismatch" }, 400);
    }
    if (existingOrder) {
      const existingWallet = String(existingOrder.nft_recipient_address || existingOrder.buyer_address || "").toLowerCase();
      if (existingWallet && buyerWallet && existingWallet !== String(buyerWallet).toLowerCase()) {
        return json({ ok: false, error: "wallet_reference_mismatch" }, 400);
      }
    }

    if (!bundleId) {
      console.warn("[confirm-bundle-paystack] missing bundle id", { reference });
      return json({ ok: false, error: "missing_bundle_id_in_metadata" }, 400);
    }
    if (!buyerWallet) {
      console.warn("[confirm-bundle-paystack] missing wallet", { reference });
      return json({ ok: false, error: "missing_wallet_in_metadata" }, 400);
    }

    await validateUserWallet(privyUserId, buyerWallet, "wallet_not_authorized_for_user");

    const { data: bundle } = await supabase
      .from("gaming_bundles")
      .select("id, vendor_id, vendor_address, bundle_address, chain_id, price_fiat, price_fiat_kobo, fiat_symbol, is_active, key_expiration_duration_seconds")
      .eq("id", bundleId)
      .maybeSingle();

    if (!bundle) {
      console.warn("[confirm-bundle-paystack] bundle not found", { bundleId });
      return json({ ok: false, error: "bundle_not_found" }, 404);
    }
    if (!bundle.is_active) {
      console.warn("[confirm-bundle-paystack] bundle inactive", { bundleId });
      return json({ ok: false, error: "bundle_not_active" }, 400);
    }

    const expectedFiat = Number(bundle.price_fiat ?? 0);
    const expectedCurrency = String(bundle.fiat_symbol || "NGN").toUpperCase();
    const expectedAmount = getExpectedPaystackAmountKobo({
      priceFiatKobo: (bundle as any).price_fiat_kobo,
      priceFiat: expectedFiat,
    });
    const issues = verifyPaystackAmountAndCurrency({
      paystackAmountMinor: verifyData?.amount,
      paystackCurrency: verifyData?.currency,
      expectedAmountMinor: expectedAmount,
      expectedCurrency,
    });

    if (!Number.isFinite(expectedFiat) || expectedFiat <= 0) {
      console.warn("[confirm-bundle-paystack] invalid bundle price", { bundleId, expectedFiat });
      return json({ ok: false, error: "bundle_price_invalid" }, 400);
    }
    if (issues.includes("currency_mismatch")) {
      console.warn("[confirm-bundle-paystack] currency mismatch", { expectedCurrency });
      return json({ ok: false, error: "currency_mismatch" }, 400);
    }
    if (issues.includes("amount_mismatch")) {
      console.warn("[confirm-bundle-paystack] amount mismatch", { expectedAmount });
      return json({ ok: false, error: "amount_mismatch" }, 400);
    }

    if (!existingOrder) {
      const { error: insertError } = await supabase
        .from("gaming_bundle_orders")
        .insert({
          bundle_id: bundle.id,
          vendor_id: bundle.vendor_id,
          vendor_address: String(bundle.vendor_address || "").toLowerCase(),
          buyer_email: buyerEmail,
          buyer_address: String(buyerWallet).toLowerCase(),
          payment_provider: "paystack",
          payment_reference: reference,
          amount_fiat: expectedFiat,
          fiat_symbol: expectedCurrency,
          chain_id: bundle.chain_id,
          bundle_address: bundle.bundle_address,
          status: "PAID",
          fulfillment_method: "NFT",
          nft_recipient_address: String(buyerWallet).toLowerCase(),
          gateway_response: {
            paystack_verify: {
              id: verifyData?.id,
              status: verifyData?.status,
              reference: verifyData?.reference,
              amount: verifyData?.amount,
              currency: verifyData?.currency,
              paid_at: verifyData?.paid_at,
            },
          },
          verified_at: new Date().toISOString(),
        } as any);

      if (insertError) return json({ ok: false, error: insertError.message }, 400);
    } else {
      await supabase
        .from("gaming_bundle_orders")
        .update({
          status: "PAID",
          amount_fiat: expectedFiat,
          fiat_symbol: expectedCurrency,
          gateway_response: {
            ...(existingOrder.gateway_response || {}),
            paystack_verify: {
              id: verifyData?.id,
              status: verifyData?.status,
              reference: verifyData?.reference,
              amount: verifyData?.amount,
              currency: verifyData?.currency,
              paid_at: verifyData?.paid_at,
            },
          },
          verified_at: new Date().toISOString(),
        } as any)
        .eq("id", existingOrder.id);
    }

    const { data: order } = await supabase
      .from("gaming_bundle_orders")
      .select(
        "id,status,fulfillment_method,payment_provider,payment_reference,amount_fiat,fiat_symbol,chain_id,bundle_address,nft_recipient_address,buyer_address,txn_hash,token_id,gateway_response,issuance_attempts,issuance_lock_id,issuance_locked_at,gaming_bundles(bundle_address,chain_id,price_fiat,price_fiat_kobo,fiat_symbol,key_expiration_duration_seconds)"
      )
      .eq("payment_reference", reference)
      .maybeSingle();

    if (!order) return json({ ok: false, error: "order_not_found" }, 404);
    if (String(order.payment_provider) !== "paystack") return json({ ok: false, error: "unsupported_payment_provider" }, 400);
    if (String(order.fulfillment_method).toUpperCase() !== "NFT") return json({ ok: false, error: "unsupported_fulfillment_method" }, 400);

    const currentAttempts = (order.issuance_attempts ?? 0) + 1;
    const { lockId } = await acquireGamingBundleIssuanceLock({ supabase, orderId: order.id, currentAttempts });
    if (!lockId) {
      console.warn("[confirm-bundle-paystack] issuance already in progress or locked", { reference, orderId: order.id });
      return json({ ok: true, processing: true, message: "issuance_already_in_progress" }, 200);
    }

    try {
      console.log("[confirm-bundle-paystack] calling issueGamingBundleNftFromPaystackVerify", { reference, orderId: order.id, lockId });
      const issued = await issueGamingBundleNftFromPaystackVerify({ supabase, order, lockId, verifyPayload });
      console.log("[confirm-bundle-paystack] issuance call returned", { reference, success: issued?.ok });
      return json(issued, 200);
    } catch (e: any) {
      console.error("[confirm-bundle-paystack] issuance failed with error", {
        reference,
        orderId: order.id,
        error: e?.message || e
      });
      await releaseGamingBundleIssuanceLock({
        supabase,
        orderId: order.id,
        lockId,
        lastError: e?.message || "issuance_failed",
      });
      return json({ ok: false, error: e?.message || "issuance_failed" }, 400);
    }
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return json({ ok: false, error: message }, 400);
  }
});
