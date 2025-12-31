/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { requireVendor } from "../_shared/vendor.ts";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeClaimCode(input: string): string {
  return input.trim().replace(/[^0-9a-fA-F]/g, "").toUpperCase();
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
    const orderId = body.order_id || body.orderId;
    const claimCode = body.claim_code || body.claimCode;
    const tokenId = body.token_id || body.tokenId;
    const bundleAddress = body.bundle_address || body.bundleAddress;
    const redeemerAddress = body.redeemer_address ? String(body.redeemer_address).trim().toLowerCase() : null;
    const redemptionLocation = body.redemption_location ? String(body.redemption_location).trim() : null;

    if (!orderId && !claimCode && !tokenId) {
      return new Response(JSON.stringify({ ok: false, error: "order_id, claim_code, or token_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Validate token_id format if provided
    if (tokenId && !/^\d+$/.test(String(tokenId))) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid token_id format (must be numeric)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let orderQuery = supabase
      .from("gaming_bundle_orders")
      .select("*");

    if (orderId) {
      orderQuery = orderQuery.eq("id", orderId);
    } else if (tokenId) {
      // Use bundle_address (Web3 primitive) to avoid token_id ambiguity across different bundles
      orderQuery = orderQuery.eq("token_id", tokenId);
      if (bundleAddress) {
        orderQuery = orderQuery.eq("bundle_address", String(bundleAddress).trim().toLowerCase());
      }
    } else {
      const normalized = normalizeClaimCode(String(claimCode));
      const hash = await sha256Hex(normalized);
      orderQuery = orderQuery.eq("claim_code_hash", hash);
    }

    const { data: order, error: orderError } = await orderQuery.maybeSingle();

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

    if (order.status !== "PAID") {
      return new Response(JSON.stringify({ ok: false, error: "Order not paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { data: redemption, error: redemptionError } = await supabase
      .from("gaming_bundle_redemptions")
      .insert({
        order_id: order.id,
        bundle_id: order.bundle_id,
        vendor_id: vendor.vendorId,
        vendor_address: vendor.vendorAddress,
        redeemer_address: redeemerAddress,
        redemption_location: redemptionLocation,
        metadata: {
          fulfillment_method: order.fulfillment_method,
          payment_provider: order.payment_provider,
        },
      })
      .select("*")
      .single();

    if (redemptionError) {
      const isDuplicate = redemptionError.code === "23505";
      return new Response(JSON.stringify({
        ok: false,
        error: isDuplicate ? "already_redeemed" : redemptionError.message,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: isDuplicate ? 409 : 400,
      });
    }

    return new Response(JSON.stringify({ ok: true, redemption }), {
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
