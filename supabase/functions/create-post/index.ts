/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import { isAnyUserWalletIsLockManagerParallel } from "../_shared/unlock.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    // 1. Authenticate via Privy JWT
    const authHeader = req.headers.get("X-Privy-Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing or invalid X-Privy-Authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
    const token = authHeader.split(" ")[1];

    let privyUserId: string | undefined;
    try {
      // Primary: JWKS verification with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("JWKS verification timeout after 3 seconds")), 3000)
      );
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
      const payload: any = await Promise.race([jwksPromise, timeoutPromise]);
      privyUserId = payload.sub as string | undefined;
    } catch (jwksError) {
      // Fallback: Local JWT verification
      if (!PRIVY_VERIFICATION_KEY) throw jwksError;
      const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, "ES256");
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: "privy.io",
        audience: PRIVY_APP_ID,
      });
      privyUserId = (payload as any).sub as string | undefined;
    }
    if (!privyUserId) {
      throw new Error("Token verification failed");
    }

    // 2. Parse and validate request body
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const eventId: string | undefined = body.eventId;
    const content: string | undefined = body.content;

    if (!eventId || !content) {
      throw new Error("Missing required fields: eventId, content");
    }
    if (content.trim().length === 0 || content.length > 5000) {
      throw new Error("Content must be between 1 and 5000 characters");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Get event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, lock_address, chain_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      throw new Error("Event not found");
    }

    if (!event.lock_address) {
      throw new Error("Event has no lock address");
    }

    // 4. Get user wallets
    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets || userWallets.length === 0) {
      throw new Error("No wallet addresses found for user");
    }

    // 5. Get RPC URL
    let rpcUrl: string | undefined;
    const { data: net } = await supabase
      .from("network_configs")
      .select("rpc_url")
      .eq("chain_id", event.chain_id)
      .maybeSingle();

    rpcUrl = net?.rpc_url as string | undefined;
    if (!rpcUrl) {
      // Fallback to hardcoded RPC URLs
      rpcUrl = ({
        8453: "https://mainnet.base.org",
        84532: "https://sepolia.base.org",
        1: "https://eth.llamarpc.com",
        11155111: "https://ethereum-sepolia-rpc.publicnode.com",
        137: "https://polygon.llamarpc.com",
        80002: "https://rpc-amoy.polygon.technology",
      } as Record<number, string>)[event.chain_id] ||
        Deno.env.get("PRIMARY_RPC_URL") ||
        undefined;
    }
    if (!rpcUrl) {
      throw new Error("Missing RPC URL for chain");
    }

    // 6. Authorization: ONLY lock managers (event creators) can create posts
    const { anyIsManager, manager } = await isAnyUserWalletIsLockManagerParallel(
      event.lock_address,
      userWallets,
      rpcUrl
    );

    if (!anyIsManager) {
      throw new Error("Unauthorized: Only event creators (lock managers) can create posts");
    }

    // 7. Insert post
    const { data: newPost, error: insertError } = await supabase
      .from("event_posts")
      .insert({
        event_id: eventId,
        creator_address: manager!.toLowerCase(),
        content: content.trim(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create post: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true, postId: newPost.id, post: newPost }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[create-post] error:", (error as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
