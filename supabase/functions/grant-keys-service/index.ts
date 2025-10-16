import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");
const UNLOCK_SERVICE_PRIVATE_KEY = Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY")!;

const PublicLockABI = [
  { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "isLockManager", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "_keyOwner", type: "address" }], name: "getHasValidKey", outputs: [{ internalType: "bool", name: "isValid", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [ { internalType: "uint256[]", name: "_expirationTimestamps", type: "uint256[]" }, { internalType: "address[]", name: "_recipients", type: "address[]" }, { internalType: "address[]", name: "_keyManagers", type: "address[]" } ], name: "grantKeys", outputs: [{ internalType: "uint256[]", name: "tokenIds", type: "uint256[]" }], stateMutability: "nonpayable", type: "function" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const privyAuth = req.headers.get("X-Privy-Authorization");
    if (!privyAuth || !privyAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid X-Privy-Authorization header" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }
    const accessToken = privyAuth.split(" ")[1];

    let privyUserId: string | undefined;
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("JWKS verification timeout after 3 seconds")), 3000));
      const jwksPromise = (async () => {
        const JWKS = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`));
        const { payload } = await jwtVerify(accessToken, JWKS, { issuer: "privy.io", audience: PRIVY_APP_ID });
        return payload;
      })();
      const payload: any = await Promise.race([jwksPromise, timeoutPromise]);
      privyUserId = payload.sub;
    } catch (_) {
      if (!PRIVY_VERIFICATION_KEY) return new Response(JSON.stringify({ error: "Token verification failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
      const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, "ES256");
      const { payload } = await jwtVerify(accessToken, publicKey, { issuer: "privy.io", audience: PRIVY_APP_ID });
      privyUserId = (payload as any).sub;
    }

    if (!privyUserId) throw new Error("User ID not found in token");

    const { transactionReference } = await req.json();
    if (!transactionReference) {
      return new Response(JSON.stringify({ error: "transactionReference is required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tx, error: txError } = await supabase
      .from("paystack_transactions")
      .select("*, events:events(id, creator_id, lock_address, chain_id)")
      .eq("reference", transactionReference)
      .single();
    if (txError || !tx) return new Response(JSON.stringify({ error: "Transaction not found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });

    const event = tx.events;
    if (!event) throw new Error("Event not found for transaction");

    const status = tx.status || tx.gateway_response?.status;
    if (status !== "success") return new Response(JSON.stringify({ error: "Payment not successful for this reference" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });

    // Authorization: creator OR on-chain manager
    let authorized = event.creator_id === privyUserId;
    let userWalletAddress: string | undefined;
    if (!authorized) {
      const resp = await fetch(`https://auth.privy.io/api/v1/users/${privyUserId}`, { method: "GET", headers: { "privy-app-id": PRIVY_APP_ID, Authorization: "Basic " + btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`) } });
      if (resp.ok) {
        const privyUserData = await resp.json();
        const wallet = privyUserData.linked_accounts?.find((acc: any) => acc.type === "wallet");
        userWalletAddress = wallet?.address;
      }
      if (userWalletAddress) {
        const { data: net, error: netErr } = await supabase.from("network_configs").select("rpc_url").eq("chain_id", event.chain_id).single();
        if (netErr || !net?.rpc_url) throw new Error("Network RPC not configured");
        const provider = new ethers.JsonRpcProvider(net.rpc_url);
        const lock = new ethers.Contract(event.lock_address, PublicLockABI, provider);
        const isManager = await lock.isLockManager(userWalletAddress);
        authorized = isManager;
      }
    }

    if (!authorized) return new Response(JSON.stringify({ error: "Unauthorized" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 });

    const customFields = tx.gateway_response?.metadata?.custom_fields || [];
    const userAddressField = customFields.find((f: any) => f.variable_name === "user_wallet_address");
    const recipient = userAddressField?.value;
    if (!recipient) throw new Error("User wallet address not found in transaction metadata");

    const { data: netCfg, error: netCfgErr } = await supabase.from("network_configs").select("rpc_url").eq("chain_id", event.chain_id).single();
    if (netCfgErr || !netCfg?.rpc_url) throw new Error("RPC URL not configured for chain");

    const provider = new ethers.JsonRpcProvider(netCfg.rpc_url);
    const wallet = new ethers.Wallet(UNLOCK_SERVICE_PRIVATE_KEY, provider);
    const lock = new ethers.Contract(event.lock_address, PublicLockABI, wallet);
    const isServiceManager = await lock.isLockManager(wallet.address);
    if (!isServiceManager) throw new Error("Service wallet is not a lock manager for this lock");

    const hasKey = await lock.getHasValidKey(recipient);
    if (hasKey) return new Response(JSON.stringify({ success: true, message: "User already has a valid key" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

    const expirationDuration = 2592000;
    const nowSec = Math.floor(Date.now() / 1000);
    const expirationTimestamp = nowSec + expirationDuration;
    try { await lock.grantKeys.staticCall([expirationTimestamp], [recipient], [recipient]); } catch (_) {}
    const txSend = await lock.grantKeys([expirationTimestamp], [recipient], [recipient]);
    const receipt = await txSend.wait();
    if (receipt.status !== 1) throw new Error("Grant key transaction failed");
    return new Response(JSON.stringify({ success: true, txHash: txSend.hash || receipt.transactionHash }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
});

