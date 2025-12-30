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

function generateClaimCode(): string {
  // 16 bytes => 128 bits of entropy; safe even if only the hash leaks.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

    const bundleId = body.bundle_id || body.bundleId;
    const buyerDisplayName = String(body.buyer_display_name || body.buyerDisplayName || "").trim();
    const buyerPhone = body.buyer_phone ? String(body.buyer_phone).trim() : null;
    const buyerAddressRaw = body.buyer_address ? String(body.buyer_address).trim().toLowerCase() : null;
    const paymentReferenceInput = body.payment_reference || body.paymentReference;

    if (!bundleId) {
      return new Response(JSON.stringify({ ok: false, error: "bundle_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (buyerAddressRaw && !ethers.isAddress(buyerAddressRaw)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid buyer_address" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: bundle, error: bundleError } = await supabase
      .from("gaming_bundles")
      .select("*")
      .eq("id", bundleId)
      .maybeSingle();

    if (bundleError || !bundle) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    if (bundle.vendor_id !== vendor.vendorId) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized for this bundle" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    if (!bundle.is_active) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle is not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const claimCode = generateClaimCode();
    const claimCodeHash = await sha256Hex(claimCode);

    // IMPORTANT: never store the bearer claim code (or any derivation that reveals it) in the DB.
    // `payment_reference` is not a secret field, so it must not contain `claimCode`.
    const paymentReference = String(paymentReferenceInput || `cash-${crypto.randomUUID()}`).trim();

    const { data: order, error: insertError } = await supabase
      .from("gaming_bundle_orders")
      .insert({
        bundle_id: bundle.id,
        vendor_id: vendor.vendorId,
        vendor_address: vendor.vendorAddress,
        buyer_address: buyerAddressRaw,
        buyer_display_name: buyerDisplayName || null,
        buyer_phone: buyerPhone,
        payment_provider: "cash",
        payment_reference: paymentReference,
        amount_fiat: bundle.price_fiat,
        fiat_symbol: bundle.fiat_symbol,
        amount_dg: bundle.price_dg,
        chain_id: bundle.chain_id,
        bundle_address: bundle.bundle_address,
        status: "PAID",
        fulfillment_method: "EAS",
        claim_code_hash: claimCodeHash,
      })
      .select("*")
      .single();

    if (insertError || !order) {
      return new Response(JSON.stringify({ ok: false, error: insertError?.message || "Failed to create order" }), {
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
      paymentReference,
      buyerDisplayName: buyerDisplayName || "Guest",
      buyerAddress: buyerAddressRaw || ethers.ZeroAddress,
      priceFiat: String(bundle.price_fiat ?? 0),
      fiatSymbol: String(bundle.fiat_symbol || "NGN"),
      priceDg: String(bundle.price_dg ?? 0),
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
      console.warn("[record-gaming-bundle-sale] Failed to store eas_uid:", updateError.message);
    }

    return new Response(JSON.stringify({
      ok: true,
      order,
      eas_uid: uid,
      claim_code: claimCode,
    }), {
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
