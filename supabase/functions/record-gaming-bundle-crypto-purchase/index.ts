/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";

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

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const bundleId = body.bundle_id || body.bundleId;
    const walletAddress = String(body.wallet_address || body.walletAddress || "").trim().toLowerCase();
    const txHash = String(body.tx_hash || body.txHash || "").trim();

    if (!bundleId || !walletAddress || !txHash) {
      return new Response(JSON.stringify({ ok: false, error: "bundle_id, wallet_address, and tx_hash are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    await validateUserWallet(userId, walletAddress, "recipient_wallet_not_authorized");

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

    if (!bundle.is_active) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle is not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!bundle.price_dg || Number(bundle.price_dg) <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "Bundle is not configured for DG payments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { data: order, error: insertError } = await supabase
      .from("gaming_bundle_orders")
      .upsert({
        bundle_id: bundle.id,
        vendor_id: bundle.vendor_id,
        vendor_address: bundle.vendor_address,
        buyer_address: walletAddress,
        payment_provider: "crypto",
        payment_reference: txHash,
        amount_dg: bundle.price_dg,
        chain_id: bundle.chain_id,
        bundle_address: bundle.bundle_address,
        status: "PAID",
        fulfillment_method: "NFT",
        nft_recipient_address: walletAddress,
        txn_hash: txHash,
      } as any, { onConflict: "payment_reference" })
      .select("*")
      .single();

    if (insertError || !order) {
      return new Response(JSON.stringify({ ok: false, error: insertError?.message || "Failed to record purchase" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Query token ID from transaction receipt
    let tokenId: string | null = null;
    try {
      const { JsonRpcProvider } = await import("https://esm.sh/ethers@6.14.4");
      const { getRpcUrl } = await import("../_shared/network-helpers.ts");
      const { getTokenIdFromTxHash } = await import("../_shared/nft-helpers.ts");

      const rpcUrl = await getRpcUrl(supabase, bundle.chain_id);
      if (rpcUrl) {
        const provider = new JsonRpcProvider(rpcUrl);
        tokenId = await getTokenIdFromTxHash(txHash, provider, bundle.bundle_address, walletAddress);

        if (tokenId) {
          console.log(`[CRYPTO PURCHASE] Extracted token ID: ${tokenId}`);
          // Update order with token ID
          await supabase
            .from("gaming_bundle_orders")
            .update({ token_id: tokenId })
            .eq("id", order.id);
        }
      }
    } catch (error: any) {
      console.warn(`[CRYPTO PURCHASE] Failed to extract token ID:`, error.message || error);
      // Don't fail the entire request if token ID extraction fails
    }

    return new Response(JSON.stringify({ ok: true, order: { ...order, token_id: tokenId } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message === "recipient_wallet_not_authorized" ? 403 : 400,
    });
  }
});
