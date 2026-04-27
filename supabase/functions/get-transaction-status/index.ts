import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";

function readMetadataField(metadata: any, key: string): string | null {
  const direct = metadata?.[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const fields = Array.isArray(metadata?.custom_fields) ? metadata.custom_fields : [];
  for (const field of fields) {
    if (String(field?.variable_name || "").toLowerCase() === key.toLowerCase()) {
      const value = String(field?.value || "").trim();
      if (value) return value;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const { reference, wallet_address } = await req.json();
    if (!reference || typeof reference !== "string") {
      return new Response(JSON.stringify({ error: "reference is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const normalizedWalletAddress =
      typeof wallet_address === "string" ? wallet_address.trim().toLowerCase() : "";
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWalletAddress)) {
      return new Response(JSON.stringify({ error: "wallet_address is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tx, error } = await supabase
      .from("paystack_transactions")
      .select("id, status, gateway_response, issuance_last_error")
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
    const txWallet = readMetadataField(rawGatewayResponse?.metadata, "user_wallet_address")?.toLowerCase();
    if (txWallet !== normalizedWalletAddress) {
      return new Response(JSON.stringify({ error: "wallet_address_mismatch" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

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

    let purchaseMessageSnapshot: string | null = null;
    if (keyGranted && tx.id) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("purchase_confirmation_message_snapshot")
        .eq("payment_transaction_id", tx.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      purchaseMessageSnapshot =
        (ticket as any)?.purchase_confirmation_message_snapshot ?? null;
    }
    if (!purchaseMessageSnapshot && keyGranted) {
      purchaseMessageSnapshot =
        typeof rawGatewayResponse?.purchase_message_snapshot === "string"
          ? rawGatewayResponse.purchase_message_snapshot
          : null;
    }

    return new Response(
      JSON.stringify({
        found: true,
        status: tx.status,
        key_granted: keyGranted,
        gateway_response: gatewayResponse,
        issuance_last_error: tx.issuance_last_error,
        purchase_confirmation_message_snapshot: purchaseMessageSnapshot,
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
