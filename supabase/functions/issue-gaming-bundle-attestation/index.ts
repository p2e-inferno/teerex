/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { EAS } from "https://esm.sh/@ethereum-attestation-service/eas-sdk@2.7.0";
import { ethers, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { requireVendor } from "../_shared/vendor.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { encodeGamingBundlePurchase, ZERO_UID } from "../_shared/gaming-bundles.ts";

const EAS_ADDRESS_BY_CHAIN: Record<number, string> = {
  8453: "0x4200000000000000000000000000000000000021",
  84532: "0x4200000000000000000000000000000000000021",
};

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

    const vendor = await requireVendor(req);
    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id || body.orderId;

    if (!orderId) {
      return new Response(JSON.stringify({ ok: false, error: "order_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: order, error: orderError } = await supabase
      .from("gaming_bundle_orders")
      .select("*, gaming_bundles(*)")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ ok: false, error: "Order not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    if (order.vendor_id !== vendor.vendorId) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized for this order" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    if (order.eas_uid) {
      return new Response(JSON.stringify({ ok: true, eas_uid: order.eas_uid, already_attested: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const bundle = (order as any).gaming_bundles;
    if (!bundle) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle not found for order" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const schemaUid = Deno.env.get("GAMING_BUNDLE_SCHEMA_UID");
    if (!schemaUid) {
      return new Response(JSON.stringify({ ok: false, error: "Missing GAMING_BUNDLE_SCHEMA_UID" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const servicePk = Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY") || Deno.env.get("SERVICE_WALLET_PRIVATE_KEY") || Deno.env.get("SERVICE_PK");
    if (!servicePk) {
      return new Response(JSON.stringify({ ok: false, error: "Missing service wallet private key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const networkConfig = await validateChain(supabase, Number(bundle.chain_id));
    if (!networkConfig?.rpc_url) {
      return new Response(JSON.stringify({ ok: false, error: "Chain not supported or RPC not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const provider = new JsonRpcProvider(networkConfig.rpc_url);
    const signer = new Wallet(servicePk, provider);
    const serviceAddress = await signer.getAddress();
    const easAddress = EAS_ADDRESS_BY_CHAIN[Number(bundle.chain_id)] || EAS_ADDRESS_BY_CHAIN[8453];
    const eas = new EAS(easAddress);
    eas.connect(signer as any);

    const encodedData = encodeGamingBundlePurchase({
      vendorAddress: bundle.vendor_address,
      bundleAddress: bundle.bundle_address,
      orderId: order.id,
      paymentReference: String(order.payment_reference || "cash"),
      buyerDisplayName: String(order.buyer_display_name || "Guest"),
      buyerAddress: order.buyer_address || ethers.ZeroAddress,
      priceFiat: String(order.amount_fiat ?? bundle.price_fiat ?? 0),
      fiatSymbol: String(order.fiat_symbol || bundle.fiat_symbol || "NGN"),
      priceDg: String(order.amount_dg ?? bundle.price_dg ?? 0),
      quantityUnits: Number(bundle.quantity_units),
      unitLabel: String(bundle.unit_label || ""),
      bundleType: String(bundle.bundle_type || ""),
      chainId: Number(bundle.chain_id),
      issuedAt: Math.floor(Date.now() / 1000),
    });

    const tx = await eas.attest({
      schema: schemaUid,
      data: {
        recipient: serviceAddress,
        expirationTime: 0n,
        revocable: false,
        refUID: ZERO_UID,
        data: encodedData,
      },
    });

    const uid = await tx.wait();

    const { error: updateError } = await supabase
      .from("gaming_bundle_orders")
      .update({ eas_uid: uid })
      .eq("id", order.id);

    if (updateError) {
      console.warn("[issue-gaming-bundle-attestation] Failed to store eas_uid:", updateError.message);
    }

    return new Response(JSON.stringify({ ok: true, eas_uid: uid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message === "vendor_access_denied" ? 403 : 400,
    });
  }
});
