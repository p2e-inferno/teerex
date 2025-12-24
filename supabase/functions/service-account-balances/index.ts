import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { JsonRpcProvider, Wallet, formatEther } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERVICE_PK } from "../_shared/constants.ts";
import { enforcePost } from "../_shared/http.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { handleError } from "../_shared/error-handler.ts";
import { validateChain } from "../_shared/network-helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });
  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;
  try {
    privyUserId = await ensureAdmin(req.headers);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const chainIds: number[] | undefined = Array.isArray(body?.chain_ids)
      ? body.chain_ids.filter((c: any) => typeof c === "number")
      : undefined;

    let query = supabase
      .from("network_configs")
      .select("chain_id, chain_name, rpc_url, block_explorer_url, native_currency_symbol, is_active")
      .eq("is_active", true)
      .order("chain_id", { ascending: true });

    if (chainIds?.length) {
      query = query.in("chain_id", chainIds);
    }

    const { data: networks, error } = await query;
    if (error) throw error;

    const primaryChainIdEnv = Deno.env.get("VITE_PRIMARY_CHAIN_ID");
    const primaryChainId = primaryChainIdEnv ? Number(primaryChainIdEnv) : 84532;

    const wallet = new Wallet(SERVICE_PK);
    const warningThreshold = Number(Deno.env.get("SERVICE_BALANCE_WARN_ETH") || "0.05");

    const balances: Array<{
      chain_id: any;
      chain_name: any;
      rpc_url: string;
      block_explorer_url: any;
      native_currency_symbol: any;
      native_balance_eth: number | null;
      warning: boolean;
      error?: string;
    }> = [];
    for (const net of networks || []) {
      // Use DB value if present, otherwise validate chain
      let rpcUrl = net.rpc_url;
      if (!rpcUrl) {
        const networkConfig = await validateChain(supabase, net.chain_id);
        if (!networkConfig?.rpc_url) {
          console.warn(`Skipping chain ${net.chain_id} - RPC URL not configured`);
          continue;
        }
        rpcUrl = networkConfig.rpc_url;
      }

      try {
        const provider = new JsonRpcProvider(rpcUrl);
        const balanceWei = await provider.getBalance(wallet.address);
        const balanceEth = Number(formatEther(balanceWei));

        balances.push({
          chain_id: net.chain_id,
        chain_name: net.chain_name,
        rpc_url: rpcUrl,
        block_explorer_url: net.block_explorer_url,
        native_currency_symbol: net.native_currency_symbol,
        native_balance_eth: balanceEth,
        warning: balanceEth < warningThreshold,
      });
    } catch (rpcError) {
      balances.push({
        chain_id: net.chain_id,
        chain_name: net.chain_name,
        rpc_url: rpcUrl,
        block_explorer_url: net.block_explorer_url,
        native_currency_symbol: net.native_currency_symbol,
        native_balance_eth: null,
        warning: true,
        error: "rpc_error",
      });
    }
  }

    return new Response(
      JSON.stringify({
        ok: true,
        primary_chain_id: primaryChainId,
        service_address: wallet.address,
        balances,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    return handleError(e, privyUserId, { "Content-Type": "application/json" });
  }
});
