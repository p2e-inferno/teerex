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

// RPC endpoints for different networks
const getRpcUrl = (chainId: number): string => {
  switch (chainId) {
    case 8453: // Base mainnet
      return "https://mainnet.base.org";
    case 84532: // Base Sepolia testnet
      return "https://sepolia.base.org";
    case 1: // Ethereum mainnet
      return "https://eth.llamarpc.com";
    case 11155111: // Ethereum Sepolia
      return "https://ethereum-sepolia-rpc.publicnode.com";
    case 137: // Polygon mainnet
      return "https://polygon.llamarpc.com";
    case 80002: // Polygon Amoy testnet
      return "https://rpc-amoy.polygon.technology";
    default:
      // Default to Base Sepolia if unknown chain
      console.warn(`Unknown chain ID: ${chainId}, defaulting to Base Sepolia`);
      return "https://sepolia.base.org";
  }
};

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

    // 2. Get user's wallet addresses via shared helper
    const userWalletAddresses = await getUserWalletAddresses(privyUserId);
    if (!userWalletAddresses || userWalletAddresses.length === 0) {
      throw new Error("Could not find user's wallet addresses.");
    }

    // 3. Get event data from request body
    const { eventId, formData } = await req.json();
    if (!eventId || !formData) {
      return new Response(
        JSON.stringify({ error: "Missing eventId or formData" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log("Updating event:", eventId);

    // 4. Create Supabase service client and fetch event to get lock address and chain_id
    const serviceRoleClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: event, error: fetchError } = await serviceRoleClient
      .from("events")
      .select("lock_address, chain_id")
      .eq("id", eventId)
      .single();

    if (fetchError) {
      console.error("Fetch error:", fetchError.message);
      return new Response(JSON.stringify({ error: "Event not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
    const lockAddress = event.lock_address;
    const chainId = event.chain_id;

    // 5. On-chain authorization: Check if any of the user's wallets is a lock manager
    const rpcUrl = getRpcUrl(chainId);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
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
            error: "Unauthorized: You are not a manager for this event.",
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

    // 6. If authorized, prepare and perform a partial update only for provided fields
    const eventData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (formData && typeof formData === "object") {
      if ("title" in formData) eventData.title = formData.title;
      if ("description" in formData) eventData.description = formData.description;
      if ("date" in formData) {
        eventData.date = formData.date ? new Date(formData.date).toISOString() : null;
      }
      if ("time" in formData) eventData.time = formData.time;
      if ("location" in formData) eventData.location = formData.location;
      if ("category" in formData) eventData.category = formData.category;
      if ("imageUrl" in formData) {
        // Only touch image_url if imageUrl was provided explicitly
        eventData.image_url = formData.imageUrl || null;
      }
      if ("service_manager_added" in formData) {
        eventData.service_manager_added = !!formData.service_manager_added;
      }
    }

    console.log("Updating event with data:", eventData);

    const { data: updatedEvent, error: updateError } = await serviceRoleClient
      .from("events")
      .update(eventData)
      .eq("id", eventId)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update event:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update event database record" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("Event updated successfully:", updatedEvent.id);

    return new Response(JSON.stringify(updatedEvent), {
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
