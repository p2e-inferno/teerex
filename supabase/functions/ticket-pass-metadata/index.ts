/* deno-lint-ignore-file no-explicit-any */
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { stripHtml } from "../_shared/html-utils.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";

const APP_BASE_URL = Deno.env.get("APP_PUBLIC_URL") || SUPABASE_URL;

/**
 * Ticket Pass NFT metadata (OpenSea-compatible).
 * URL pattern: /ticket-pass-metadata/{lockAddress}/{tokenId}
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const lockAddress = parts[parts.length - 2];
    const tokenId = parts[parts.length - 1];

    if (!lockAddress || !tokenId) {
      return new Response(JSON.stringify({ error: "Invalid path. Expected /ticket-pass-metadata/{lockAddress}/{tokenId}" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(lockAddress)) {
      return new Response(JSON.stringify({ error: "Invalid lock address format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^\d+$/.test(tokenId)) {
      return new Response(JSON.stringify({ error: "Invalid token ID format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pass, error } = await supabase
      .from("ticket_passes")
      .select("*")
      .eq("lock_address", lockAddress.toLowerCase())
      .single();

    if (error || !pass) {
      return new Response(JSON.stringify({ error: "Ticket pass not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceDisplay = pass.price_fiat > 0 ? `${pass.fiat_symbol} ${pass.price_fiat}` : "Free";

    const metadata = {
      name: `${pass.title} - Pass #${tokenId}`,
      description: stripHtml(pass.description) || `Ticket Pass: ${pass.title}`,
      image: pass.image_url || "",
      external_url: `${APP_BASE_URL}/ticket-passes/${pass.id}`,
      attributes: [
        { trait_type: "Pass", value: pass.title },
        { trait_type: "Payout Token", value: pass.payout_token_symbol || (pass.eth_per_copy_wei !== "0" ? "ETH" : "—") },
        { trait_type: "Price", value: priceDisplay },
        { trait_type: "Chain ID", value: pass.chain_id },
        ...(pass.target_event_address ? [{ trait_type: "Event", value: pass.target_event_address }] : []),
      ],
    };

    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch (err: any) {
    console.error("[ticket-pass-metadata]", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
