import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import { renounceServiceManager } from "../_shared/service-manager.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");


serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    // Read Privy token from dedicated header to keep Authorization for Supabase
    const authHeader = req.headers.get("X-Privy-Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid X-Privy-Authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // Create Supabase client with service role for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Authenticate user using Privy JWT verification
    const token = authHeader.split(" ")[1];
    console.log("Attempting to verify JWT token with Privy...");

    let privyUserId: string | undefined;

    try {
      // Primary: JWKS verification with timeout (like p2einferno approach)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("JWKS verification timeout after 3 seconds")),
          3000
        );
      });

      const jwksPromise = (async () => {
        // Use Privy's app-specific JWKS endpoint (more reliable than generic endpoint)
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
      console.log("JWT verification successful via JWKS");
    } catch (jwksError) {
      console.warn(
        "JWKS verification failed, trying local JWT fallback:",
        jwksError.message
      );

      // Fallback: Local JWT verification with verification key (like p2einferno)
      try {
        if (!PRIVY_VERIFICATION_KEY || !PRIVY_APP_ID) {
          throw new Error("Missing JWT verification configuration");
        }

        // Import the ES256 public key
        const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, "ES256");

        // Verify the JWT locally
        const { payload } = await jwtVerify(token, publicKey, {
          issuer: "privy.io",
          audience: PRIVY_APP_ID,
        });

        privyUserId = payload.sub;
        console.log("JWT verification successful via local verification key");
      } catch (localVerifyError) {
        console.error(
          "Both JWKS and local JWT verification failed:",
          localVerifyError.message
        );
        throw new Error("Token verification failed. Please log in again.");
      }
    }

    if (!privyUserId) {
      throw new Error("User ID not found in token");
    }

    console.log("User authenticated:", privyUserId);

    // Get request body
    const { eventId } = await req.json();

    if (!eventId) {
      throw new Error("Event ID is required");
    }

    // Fetch event details
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      throw new Error("Event not found");
    }

    // Verify user is the event creator
    if (event.creator_id !== privyUserId) {
      throw new Error("Only the event creator can remove the service manager");
    }

    console.log("Renouncing lock manager role for lock:", event.lock_address);
    const userWallets = await getUserWalletAddresses(privyUserId);
    const { transactionHash } = await renounceServiceManager({
      supabase: supabaseAdmin,
      lockAddress: event.lock_address,
      chainId: event.chain_id,
      userWallets,
      requireUserManager: false,
    });

    // Update the database
    const { error: updateError } = await supabaseAdmin
      .from("events")
      .update({ service_manager_added: false })
      .eq("id", eventId);

    if (updateError) {
      console.error("Failed to update database:", updateError);
      // Transaction succeeded but DB update failed - log for manual reconciliation
    }

    return new Response(
      JSON.stringify({
        success: true,
        transactionHash,
        message: "Service manager removed successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error removing service manager:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
