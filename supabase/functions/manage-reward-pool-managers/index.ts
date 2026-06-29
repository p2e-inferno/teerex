/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { getRewardsController } from "../_shared/reward-pools.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const rewardPoolId = String(body.reward_pool_id || body.id || "").trim();
    const managerAddress = String(body.manager_address || "").trim().toLowerCase();
    const action = String(body.action || "").trim().toLowerCase();
    const txHash = body.tx_hash ? String(body.tx_hash).trim() : null;

    if (!rewardPoolId) return json({ ok: false, error: "reward_pool_id_required" }, 400);
    if (!isAddr(managerAddress)) return json({ ok: false, error: "Invalid manager_address" }, 400);
    if (action !== "add" && action !== "remove") return json({ ok: false, error: "Invalid action" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pool } = await supabase
      .from("reward_pools")
      .select("id, creator_id, chain_id, controller_address, pool_id")
      .eq("id", rewardPoolId)
      .maybeSingle();

    if (!pool) return json({ ok: false, error: "pool_not_found" }, 404);
    if (pool.creator_id !== privyUserId) return json({ ok: false, error: "forbidden" }, 403);

    const networkConfig = await validateChain(supabase, Number(pool.chain_id));
    if (!networkConfig?.rpc_url) return json({ ok: false, error: "rpc_not_configured" }, 400);

    // Confirm the on-chain state matches the requested change before mirroring it.
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const controller = getRewardsController(pool.controller_address, provider);
    const onchain: boolean = await controller.isManager(Number(pool.pool_id), managerAddress);
    const expected = action === "add";
    if (onchain !== expected) {
      return json({ ok: false, error: "manager_state_mismatch_on_chain" }, 400);
    }

    const { data, error } = await supabase
      .from("reward_pool_managers")
      .upsert(
        {
          reward_pool_id: pool.id,
          manager_address: managerAddress,
          active: expected,
          tx_hash: txHash,
        },
        { onConflict: "reward_pool_id,manager_address" },
      )
      .select("*")
      .single();

    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true, manager: data }, 200);
  } catch (err: any) {
    console.error("[manage-reward-pool-managers]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
