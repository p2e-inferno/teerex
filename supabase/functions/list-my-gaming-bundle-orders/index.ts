/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { getUserWalletAddresses, verifyPrivyToken } from "../_shared/privy.ts";

function toPostgrestInList(values: string[]): string {
  const escaped = values
    .filter(Boolean)
    .map((v) => `"${String(v).replaceAll('"', '\\"')}"`)
    .join(",");
  return `(${escaped})`;
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

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const wallets = await getUserWalletAddresses(userId);
    if (!wallets.length) {
      return new Response(JSON.stringify({ ok: true, orders: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const status = body.status || url.searchParams.get("status");
    const limit = Math.min(Number((body.limit ?? url.searchParams.get("limit")) || 50), 200);
    const offset = Math.max(Number((body.offset ?? url.searchParams.get("offset")) || 0), 0);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const inList = toPostgrestInList(wallets.map((w) => w.toLowerCase()));

    let query = supabase
      .from("gaming_bundle_orders")
      .select(
        "id,bundle_id,created_at,status,fulfillment_method,payment_provider,payment_reference,amount_fiat,fiat_symbol,amount_dg,chain_id,bundle_address,buyer_address,buyer_email,buyer_display_name,buyer_phone,eas_uid,nft_recipient_address,token_id,txn_hash,gaming_bundles(title,bundle_type,quantity_units,unit_label,image_url,location)"
      )
      .or(`buyer_address.in.${inList},nft_recipient_address.in.${inList}`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", String(status).toUpperCase());

    const { data: orders, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    return new Response(JSON.stringify({ ok: true, orders: orders || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message.includes("authorization") ? 401 : 400,
    });
  }
});

