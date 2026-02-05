import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const { reference } = await req.json();
    if (!reference || typeof reference !== "string") {
      return new Response(JSON.stringify({ error: "reference is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tx, error } = await supabase
      .from("paystack_transactions")
      .select("status, gateway_response, issuance_last_error")
      .eq("reference", reference)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (!tx) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const rawGatewayResponse = (tx as any)?.gateway_response;
    const keyGranted = Boolean(rawGatewayResponse?.key_granted);
    const gatewayTxnHash =
      rawGatewayResponse?.tx_hash ||
      rawGatewayResponse?.transactionHash ||
      rawGatewayResponse?.transaction_hash ||
      rawGatewayResponse?.key_grant_tx_hash ||
      rawGatewayResponse?.hash ||
      null;

    const gatewayResponse =
      rawGatewayResponse == null
        ? null
        : {
          key_granted: keyGranted,
          tx_hash: gatewayTxnHash,
        };

    return new Response(
      JSON.stringify({
        found: true,
        status: tx.status,
        key_granted: keyGranted,
        gateway_response: gatewayResponse,
        issuance_last_error: tx.issuance_last_error,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
