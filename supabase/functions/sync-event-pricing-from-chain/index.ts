/**
 * Phase 2: Sync Event Pricing from On-Chain Lock State
 *
 * This edge function syncs the database event pricing (price and currency)
 * to match the on-chain lock contract state. It's triggered by the user
 * from the event edit page when a pricing mismatch is detected.
 *
 * Authorization: Only the lock manager (event creator) can sync pricing
 *
 * Flow:
 * 1. Verify Privy JWT token to get user ID
 * 2. Fetch event from database
 * 3. Verify user owns event (creator_id matches)
 * 4. Verify user is a lock manager on-chain (safety check)
 * 5. Query on-chain pricing from lock contract
 * 6. Update database event record with on-chain values
 * 7. Return updated event data
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";
import { ethers, Contract, JsonRpcProvider } from "https://esm.sh/ethers@6.14.4";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { isAnyUserWalletIsLockManagerParallel, resolveCurrencyFromAddress } from "../_shared/unlock.ts";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import ERC20ABI from "../_shared/abi/ERC20.json" assert { type: "json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    // 1. Authenticate user using Privy JWT
    const authHeader = req.headers.get("X-Privy-Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized_missing_token" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const token = authHeader.split(" ")[1];
    console.log("[sync-event-pricing] Verifying JWT token...");

    let privyUserId: string | undefined;

    try {
      // Primary: JWKS verification with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("JWKS verification timeout after 3 seconds")),
          3000
        );
      });

      const jwksPromise = (async () => {
        const JWKS = createRemoteJWKSet(
          new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`)
        );
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: "privy.io",
          audience: PRIVY_APP_ID,
        });
        return payload;
      })();

      const payload = await Promise.race([jwksPromise, timeoutPromise]);
      privyUserId = payload.sub;
      console.log("[sync-event-pricing] JWT verified via JWKS");
    } catch (jwksError) {
      console.warn("[sync-event-pricing] JWKS failed, trying local verification:", jwksError.message);

      try {
        if (!PRIVY_VERIFICATION_KEY || !PRIVY_APP_ID) {
          throw new Error("Missing JWT verification configuration");
        }

        const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, "ES256");
        const { payload } = await jwtVerify(token, publicKey, {
          issuer: "privy.io",
          audience: PRIVY_APP_ID,
        });

        privyUserId = payload.sub;
        console.log("[sync-event-pricing] JWT verified via local key");
      } catch (localVerifyError) {
        console.error("[sync-event-pricing] Both verification methods failed:", localVerifyError.message);
        return new Response(
          JSON.stringify({ ok: false, error: "unauthorized_invalid_token" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          }
        );
      }
    }

    if (!privyUserId) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized_no_user_id" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    console.log("[sync-event-pricing] Authenticated user:", privyUserId);

    // 2. Parse request body
    const { event_id } = await req.json();

    if (!event_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_event_id" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log("[sync-event-pricing] Syncing event:", event_id);

    // 3. Create Supabase client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Fetch event from database
    const { data: event, error: fetchError } = await supabaseAdmin
      .from("events")
      .select("id, lock_address, chain_id, price, currency, creator_id")
      .eq("id", event_id)
      .single();

    if (fetchError || !event) {
      console.error("[sync-event-pricing] Event not found:", fetchError);
      return new Response(
        JSON.stringify({ ok: false, error: "event_not_found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // 5. Verify user owns the event
    if (event.creator_id !== privyUserId) {
      console.warn("[sync-event-pricing] User does not own event:", {
        eventCreator: event.creator_id,
        userId: privyUserId,
      });
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized_not_creator" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }
      );
    }

    // 6. Validate chain and get network config
    const networkConfig = await validateChain(supabaseAdmin, event.chain_id);
    if (!networkConfig) {
      return new Response(
        JSON.stringify({ ok: false, error: "chain_not_supported" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (!networkConfig.rpc_url) {
      return new Response(
        JSON.stringify({ ok: false, error: "rpc_url_not_configured" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 7. Get user wallet addresses
    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets || userWallets.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_wallet_found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log("[sync-event-pricing] User wallets:", userWallets);

    // 8. Verify user is a lock manager (safety check)
    const managerCheck = await isAnyUserWalletIsLockManagerParallel(
      event.lock_address,
      userWallets,
      networkConfig.rpc_url
    );

    if (!managerCheck.anyIsManager) {
      console.warn("[sync-event-pricing] User is not a lock manager");
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized_not_lock_manager" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }
      );
    }

    console.log("[sync-event-pricing] User is lock manager:", managerCheck.manager);

    // 9. Query on-chain pricing
    const provider = new JsonRpcProvider(networkConfig.rpc_url);
    const lockContract = new Contract(event.lock_address, PublicLockV15 as any, provider);

    const [keyPrice, tokenAddress] = await Promise.all([
      lockContract.keyPrice(),
      lockContract.tokenAddress(),
    ]);

    console.log("[sync-event-pricing] On-chain data:", {
      keyPrice: keyPrice.toString(),
      tokenAddress,
    });

    // 10. Resolve currency from token address
    const currency = resolveCurrencyFromAddress(tokenAddress, networkConfig);

    // 11. Get decimals and convert price to human-readable format
    let decimals = 18;
    if (tokenAddress !== ethers.ZeroAddress) {
      const tokenContract = new Contract(tokenAddress, ERC20ABI as any, provider);
      decimals = Number(await tokenContract.decimals());
    }

    const humanPrice = parseFloat(ethers.formatUnits(keyPrice, decimals));

    console.log("[sync-event-pricing] Resolved pricing:", {
      price: humanPrice,
      currency,
      decimals,
    });

    // 12. Update database with on-chain pricing
    const { data: updatedEvent, error: updateError } = await supabaseAdmin
      .from("events")
      .update({
        price: humanPrice,
        currency: currency,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event_id)
      .select()
      .single();

    if (updateError) {
      console.error("[sync-event-pricing] Database update failed:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: "database_update_failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("[sync-event-pricing] Successfully synced pricing for event:", event_id);

    // 13. Return success response with updated event
    return new Response(
      JSON.stringify({
        ok: true,
        event: updatedEvent,
        syncedFrom: "on-chain",
        previousPricing: {
          price: event.price,
          currency: event.currency,
        },
        newPricing: {
          price: humanPrice,
          currency: currency,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[sync-event-pricing] Unexpected error:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: "internal_server_error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
