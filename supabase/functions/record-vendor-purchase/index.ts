import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

/**
 * Record Vendor Purchase
 *
 * Records a vendor lock purchase in the database after successful on-chain transaction.
 * Requires Privy authentication.
 *
 * @param vendor_lock_id - UUID of the vendor lock
 * @param wallet_address - Wallet address that made the purchase
 * @param tx_hash - Transaction hash
 * @param chain_id - Blockchain chain ID
 * @param lock_address - Lock contract address
 * @param price_paid_wei - Price paid in wei (BigInt as string)
 * @param currency - Currency used (ETH, USDC, DG, etc.)
 * @returns Purchase record ID
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 405,
        }
      );
    }

    // Verify Privy JWT
    const purchaserId = await verifyPrivyToken(
      req.headers.get("X-Privy-Authorization")
    );

    const body = await req.json().catch(() => ({}));

    const {
      vendor_lock_id,
      wallet_address,
      tx_hash,
      chain_id,
      lock_address,
      price_paid_wei,
      currency,
    } = body;

    // Validate required fields
    if (
      !vendor_lock_id ||
      !wallet_address ||
      !tx_hash ||
      !chain_id ||
      !lock_address
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing required fields: vendor_lock_id, wallet_address, tx_hash, chain_id, lock_address",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid wallet address format" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate transaction hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(tx_hash)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid transaction hash format" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Insert purchase record
    const { data, error } = await supabase
      .from("vendor_lock_purchases")
      .insert({
        vendor_lock_id,
        purchaser_id: purchaserId,
        wallet_address: wallet_address.toLowerCase(),
        tx_hash,
        chain_id,
        lock_address: lock_address.toLowerCase(),
        price_paid_wei,
        currency,
      })
      .select("id")
      .single();

    if (error) {
      // Check for duplicate transaction hash
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Purchase already recorded (duplicate transaction hash)",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          }
        );
      }

      console.error("[record-vendor-purchase] Database error:", error);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to record purchase",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        purchase_id: data.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[record-vendor-purchase] Error:", error);
    const status = error.message === "unauthorized" ? 401 : 500;
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Internal server error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status,
      }
    );
  }
});
