/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { requireVendor } from "../_shared/vendor.ts";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }

    const vendor = await requireVendor(req);

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const q = String(body.q ?? url.searchParams.get("q") ?? "").trim();
    const bundleId = body.bundle_id || body.bundleId || url.searchParams.get("bundle_id");
    const status = body.status || url.searchParams.get("status");
    const paymentProvider = body.payment_provider || body.paymentProvider || url.searchParams.get("payment_provider");
    const fulfillmentMethod = body.fulfillment_method || body.fulfillmentMethod || url.searchParams.get("fulfillment_method");
    const limit = Math.min(Number(body.limit ?? url.searchParams.get("limit") || 50), 200);
    const offset = Math.max(Number(body.offset ?? url.searchParams.get("offset") || 0), 0);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase
      .from("gaming_bundle_orders")
      .select(
        "id,bundle_id,created_at,status,fulfillment_method,payment_provider,payment_reference,amount_fiat,fiat_symbol,amount_dg,chain_id,bundle_address,buyer_address,buyer_display_name,buyer_phone,eas_uid,nft_recipient_address,token_id,txn_hash,claim_code_hash,gaming_bundles(title,quantity_units,unit_label,bundle_type)"
      )
      .eq("vendor_id", vendor.vendorId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (bundleId) query = query.eq("bundle_id", bundleId);
    if (status) query = query.eq("status", String(status).toUpperCase());
    if (paymentProvider) query = query.eq("payment_provider", String(paymentProvider));
    if (fulfillmentMethod) query = query.eq("fulfillment_method", String(fulfillmentMethod).toUpperCase());

    if (q) {
      const clauses: string[] = [];
      if (isUuid(q)) clauses.push(`id.eq.${q}`);
      if (/^0x[0-9a-f]{40}$/i.test(q)) clauses.push(`buyer_address.eq.${q.toLowerCase()}`);
      clauses.push(`buyer_phone.ilike.%${q}%`);
      clauses.push(`buyer_display_name.ilike.%${q}%`);
      query = query.or(clauses.join(","));
    }

    const { data: orders, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const orderIds = (orders || []).map((o: any) => o.id);
    const redemptionMap: Record<string, string> = {};
    if (orderIds.length > 0) {
      const { data: redemptions } = await supabase
        .from("gaming_bundle_redemptions")
        .select("order_id,redeemed_at")
        .in("order_id", orderIds);
      for (const r of redemptions || []) {
        if (r?.order_id && r?.redeemed_at) redemptionMap[String(r.order_id)] = String(r.redeemed_at);
      }
    }

    const payload = (orders || []).map((order: any) => {
      const redeemedAt = redemptionMap[String(order.id)] || null;
      const canReissue =
        Boolean(order.claim_code_hash) &&
        String(order.status || "").toUpperCase() === "PAID" &&
        String(order.fulfillment_method || "").toUpperCase() === "EAS" &&
        redeemedAt === null;
      const { claim_code_hash: _claimCodeHash, ...safe } = order;
      return {
        ...safe,
        redeemed_at: redeemedAt,
        can_reissue: canReissue,
      };
    });

    return new Response(JSON.stringify({ ok: true, orders: payload }), {
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
