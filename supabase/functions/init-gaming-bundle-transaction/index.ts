/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { normalizeEmail } from "../_shared/email-utils.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { resolveFiatPayoutRouting, SELLER_PAYOUT_UNAVAILABLE_MESSAGE } from "../_shared/payout-routing.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }

    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};

    const bundleId: string | undefined = body.bundle_id || body.bundleId;
    const reference: string | undefined = body.reference;
    const email: string | undefined = body.email;
    const walletAddress: string | undefined = body.wallet_address || body.walletAddress;
    const requestedAmountKobo: number | undefined = typeof body.amount === "number" ? body.amount : undefined;

    console.log("[init-gaming-bundle-transaction] request", {
      bundleId,
      reference,
      hasEmail: Boolean(email),
      hasWalletAddress: Boolean(walletAddress),
      amountKobo: requestedAmountKobo,
    });

    if (!bundleId || !reference || !email || !walletAddress) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields: bundle_id, reference, email, wallet_address" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: bundle, error: bundleError } = await supabase
      .from("gaming_bundles")
      .select("id, vendor_id, vendor_address, bundle_address, chain_id, price_fiat, price_fiat_kobo, fiat_symbol, is_active, payout_destination")
      .eq("id", bundleId)
      .maybeSingle();

    if (bundleError || !bundle) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    if (!bundle.is_active) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle is not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Resolve where this sale settles. 'seller' requires a verified subaccount (no silent platform
    // fallback) — blocked if missing/suspended. 'platform' routes to the platform account by design.
    let subaccountCode: string | null = null;
    try {
      const routing = await resolveFiatPayoutRouting(supabase, {
        sellerId: bundle.vendor_id,
        destination: (bundle as any).payout_destination,
      });
      subaccountCode = routing.subaccountCode;
    } catch (routingErr: any) {
      if (routingErr?.message === "seller_payout_unavailable") {
        return new Response(JSON.stringify({ ok: false, error: SELLER_PAYOUT_UNAVAILABLE_MESSAGE, code: "seller_payout_unavailable" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
      throw routingErr;
    }

    const expectedAmountKobo = typeof (bundle as any).price_fiat_kobo === "number"
      ? (bundle as any).price_fiat_kobo
      : Math.round(Number((bundle as any).price_fiat ?? 0) * 100);
    if (typeof requestedAmountKobo === "number" && requestedAmountKobo !== expectedAmountKobo) {
      return new Response(JSON.stringify({ ok: false, error: "amount_mismatch" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const amountFiat = expectedAmountKobo / 100;

    const { error: insertError } = await supabase
      .from("gaming_bundle_orders")
      .upsert({
        bundle_id: bundleId,
        vendor_id: bundle.vendor_id,
        vendor_address: String(bundle.vendor_address || "").toLowerCase(),
        buyer_email: normalizedEmail,
        buyer_address: walletAddress.toLowerCase(),
        payment_provider: "paystack",
        payment_reference: reference,
        amount_fiat: amountFiat,
        fiat_symbol: bundle.fiat_symbol || "NGN",
        chain_id: bundle.chain_id,
        bundle_address: bundle.bundle_address,
        status: "PENDING",
        fulfillment_method: "NFT",
        nft_recipient_address: walletAddress.toLowerCase(),
      } as any, { onConflict: "payment_reference" });

    if (insertError) {
      return new Response(JSON.stringify({ ok: false, error: insertError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    return new Response(JSON.stringify({ ok: true, amount_kobo: expectedAmountKobo, subaccount_code: subaccountCode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
