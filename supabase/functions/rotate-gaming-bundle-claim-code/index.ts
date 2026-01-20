/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { requireVendor } from "../_shared/vendor.ts";
import { generateClaimCode, sha256Hex } from "../_shared/gaming-bundles.ts";


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
    const reason = body.reason ? String(body.reason).slice(0, 250) : null;

    if (!orderId) {
      return new Response(JSON.stringify({ ok: false, error: "order_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: order, error: orderError } = await supabase
      .from("gaming_bundle_orders")
      .select("id,vendor_id,status,claim_code_hash,fulfillment_method")
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

    if (!order.claim_code_hash) {
      return new Response(JSON.stringify({ ok: false, error: "Order does not have an offline claim code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (String(order.status || "").toUpperCase() !== "PAID") {
      return new Response(JSON.stringify({ ok: false, error: "Order is not paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (String(order.fulfillment_method || "").toUpperCase() !== "EAS") {
      return new Response(JSON.stringify({ ok: false, error: "Order is already claimed or not eligible" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { data: existingRedemption } = await supabase
      .from("gaming_bundle_redemptions")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingRedemption) {
      return new Response(JSON.stringify({ ok: false, error: "Order already redeemed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const oldHash = String(order.claim_code_hash);
    let claimCode: string | null = null;
    let newHash: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateClaimCode();
      const hash = await sha256Hex(candidate);
      const { data: collision } = await supabase
        .from("gaming_bundle_orders")
        .select("id")
        .eq("claim_code_hash", hash)
        .maybeSingle();
      if (!collision || collision.id === orderId) {
        claimCode = candidate;
        newHash = hash;
        break;
      }
    }

    if (!claimCode || !newHash) {
      return new Response(JSON.stringify({ ok: false, error: "Failed to generate claim code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("gaming_bundle_orders")
      .update({ claim_code_hash: newHash })
      .eq("id", orderId)
      .eq("claim_code_hash", oldHash)
      .eq("fulfillment_method", "EAS")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return new Response(JSON.stringify({ ok: false, error: "Failed to rotate claim code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { error: auditError } = await supabase.from("gaming_bundle_claim_code_rotations").insert({
      order_id: orderId,
      vendor_id: vendor.vendorId,
      vendor_address: vendor.vendorAddress,
      old_claim_code_hash: oldHash,
      new_claim_code_hash: newHash,
      reason,
    });
    if (auditError) {
      console.warn("[rotate-gaming-bundle-claim-code] Failed to audit rotation:", auditError.message);
    }

    return new Response(JSON.stringify({ ok: true, order_id: orderId, claim_code: claimCode }), {
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
