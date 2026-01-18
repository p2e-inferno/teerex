import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id || body.orderId;
    const reference = body.reference;
    const claimCode = body.claim_code || body.claimCode;

    if (!orderId && !reference && !claimCode) {
      return new Response(JSON.stringify({ error: "order_id, reference, or claim_code is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    function normalizeClaimCode(input: string): string {
      return input.trim().replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    }

    async function sha256Hex(input: string): Promise<string> {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    let query = supabase
      .from("gaming_bundle_orders")
      .select("status, fulfillment_method, txn_hash, token_id, eas_uid, nft_recipient_address, gateway_response")
      .limit(1);

    if (orderId) {
      query = query.eq("id", orderId);
    } else if (reference) {
      query = query.eq("payment_reference", reference);
    } else {
      const normalized = normalizeClaimCode(String(claimCode));
      const hash = await sha256Hex(normalized);
      query = query.eq("claim_code_hash", hash);
    }

    const { data: order, error } = await query.maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (!order) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({
      found: true,
      status: order.status,
      fulfillment_method: order.fulfillment_method,
      txn_hash: order.txn_hash || null,
      token_id: (order as any).token_id || null,
      eas_uid: order.eas_uid || null,
      nft_recipient_address: order.nft_recipient_address || null,
      key_granted: Boolean((order as any)?.gateway_response?.key_granted),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
