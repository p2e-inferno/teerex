import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");

const PublicLockABI = [
  {
    inputs: [{ internalType: "address", name: "_account", type: "address" }],
    name: "isLockManager",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    // 1. Authenticate user using Privy JWT from dedicated header
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

    const token = authHeader.split(" ")[1];
    console.log("Attempting to verify JWT token...");

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
      console.log("JWT verification successful via JWKS");
    } catch (jwksError) {
      console.warn(
        "JWKS verification failed, trying local JWT fallback:",
        jwksError.message
      );

      // Fallback: Local JWT verification
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

    // 2. Get user's wallet addresses
    const userWalletAddresses = await getUserWalletAddresses(privyUserId);
    if (!userWalletAddresses || userWalletAddresses.length === 0) {
      throw new Error("Could not find user's wallet addresses.");
    }

    // 3. Get bundle data from request body
    const { bundle_id, ...formData } = await req.json();
    if (!bundle_id) {
      return new Response(
        JSON.stringify({ error: "Missing bundle_id" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log("Updating gaming bundle:", bundle_id);

    // 4. Create Supabase service client and fetch bundle to get lock address and chain_id
    const serviceRoleClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: bundle, error: fetchError } = await serviceRoleClient
      .from("gaming_bundles")
      .select("bundle_address, chain_id")
      .eq("id", bundle_id)
      .single();

    if (fetchError) {
      console.error("Fetch error:", fetchError.message);
      return new Response(JSON.stringify({ error: "Bundle not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
    const lockAddress = bundle.bundle_address;
    const chainId = bundle.chain_id;

    // 5. Validate chain and get network configuration
    const networkConfig = await validateChain(serviceRoleClient, chainId);
    if (!networkConfig) {
      return new Response(
        JSON.stringify({ error: "Chain not supported or not active" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (!networkConfig.rpc_url) {
      return new Response(
        JSON.stringify({ error: "Network not fully configured (missing RPC URL)" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 6. On-chain authorization: Check if any of the user's wallets is a lock manager
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const lockContract = new ethers.Contract(
      lockAddress,
      PublicLockABI,
      provider
    );

    try {
      let authorized = false;
      for (const addr of userWalletAddresses) {
        const isManager = await lockContract.isLockManager(addr);
        if (isManager) { authorized = true; break; }
      }
      if (!authorized) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized: You are not a manager for this bundle.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          }
        );
      }
    } catch (contractError) {
      console.error("Error checking lock manager status:", contractError);
      return new Response(
        JSON.stringify({
          error: "Failed to verify lock manager status on blockchain",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 7. If authorized, prepare and perform a partial update only for provided fields
    const bundleData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (formData && typeof formData === "object") {
      if ("title" in formData) bundleData.title = formData.title;
      if ("description" in formData) bundleData.description = formData.description;
      if ("game_title" in formData) bundleData.game_title = formData.game_title || null;
      if ("console" in formData) bundleData.console = formData.console || null;
      if ("location" in formData) bundleData.location = formData.location;
      if ("image_url" in formData) bundleData.image_url = formData.image_url || null;
      if ("price_fiat" in formData) bundleData.price_fiat = formData.price_fiat;
      if ("price_dg" in formData) bundleData.price_dg = formData.price_dg || null;
      if ("is_active" in formData) bundleData.is_active = !!formData.is_active;
      if ("metadata_set" in formData) bundleData.metadata_set = !!formData.metadata_set;
      if ("quantity_units" in formData) bundleData.quantity_units = formData.quantity_units;
      if ("unit_label" in formData) bundleData.unit_label = formData.unit_label;
      if ("service_manager_added" in formData) bundleData.service_manager_added = !!formData.service_manager_added;
    }

    console.log("Updating bundle with data:", bundleData);

    const { data: updatedBundle, error: updateError } = await serviceRoleClient
      .from("gaming_bundles")
      .update(bundleData)
      .eq("id", bundle_id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update bundle:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update bundle database record" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("Bundle updated successfully:", updatedBundle.id);

    return new Response(JSON.stringify(updatedBundle), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("Function error:", e);
    if (e.code === "ERR_JWT_EXPIRED") {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (e.code && e.code.startsWith("ERR_JWT")) {
      return new Response(
        JSON.stringify({ error: `Invalid token: ${e.code}` }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
