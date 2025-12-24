/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Verify Privy token
    const authHeader = req.headers.get("X-Privy-Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid X-Privy-Authorization header" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }
    const token = authHeader.split(" ")[1];

    let privyUserId: string | undefined;
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("JWKS verification timeout after 3 seconds")), 3000));
      const jwksPromise = (async () => {
        const JWKS = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`));
        const { payload } = await jwtVerify(token, JWKS, { issuer: "privy.io", audience: PRIVY_APP_ID });
        return payload;
      })();
      const payload: any = await Promise.race([jwksPromise, timeoutPromise]);
      privyUserId = payload.sub as string | undefined;
    } catch (jwksError) {
      if (!PRIVY_VERIFICATION_KEY) throw jwksError;
      const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, "ES256");
      const { payload } = await jwtVerify(token, publicKey, { issuer: "privy.io", audience: PRIVY_APP_ID });
      privyUserId = (payload as any).sub as string | undefined;
    }
    if (!privyUserId) throw new Error("Token verification failed");

    // 2) Resolve admin lock and RPC
    const ADMIN_LOCK_ADDRESS = Deno.env.get("ADMIN_LOCK_ADDRESS");
    if (!ADMIN_LOCK_ADDRESS) {
      return new Response(JSON.stringify({ error: "admin_lock_not_configured", is_admin: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // Get network config by primary chain id
    const primaryChainIdStr = Deno.env.get("VITE_PRIMARY_CHAIN_ID");
    const primaryChainId = primaryChainIdStr ? Number(primaryChainIdStr) : 84532;
    const networkConfig = await validateChain(supabase, primaryChainId);
    if (!networkConfig?.rpc_url) {
      throw new Error("Network RPC not configured");
    }
    const rpcUrl = networkConfig.rpc_url;

    // 3) Check if any user wallet is a lock manager
    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets || userWallets.length === 0) {
      return new Response(JSON.stringify({ is_admin: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const lockManagerABI = [
      {
        inputs: [{ internalType: "address", name: "_account", type: "address" }],
        name: "isLockManager",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const lock = new ethers.Contract(ADMIN_LOCK_ADDRESS, lockManagerABI, provider);
    for (const addr of userWallets) {
      try {
        const ok = await lock.isLockManager(addr);
        if (ok) {
          return new Response(JSON.stringify({ is_admin: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }
      } catch (_) {}
    }

    return new Response(JSON.stringify({ is_admin: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }
});

