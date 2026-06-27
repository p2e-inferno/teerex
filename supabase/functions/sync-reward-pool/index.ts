/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import {
  getRewardsController,
  readRewardPool,
  readRewardPositions,
  deriveRewardPoolStatus,
  epochToIso,
} from "../_shared/reward-pools.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    // Any authenticated user may reconcile a known pool; this only mirrors public on-chain state.
    await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || body.reward_pool_id || "").trim();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let row: any = null;
    if (id) {
      const { data } = await supabase
        .from("reward_pools")
        .select("id, chain_id, controller_address, pool_id")
        .eq("id", id)
        .maybeSingle();
      row = data;
    } else {
      const chainId = Number(body.chain_id);
      const controllerAddress = String(body.controller_address || "").trim().toLowerCase();
      const poolId = Number(body.pool_id);
      const { data } = await supabase
        .from("reward_pools")
        .select("id, chain_id, controller_address, pool_id")
        .eq("chain_id", chainId)
        .eq("controller_address", controllerAddress)
        .eq("pool_id", poolId)
        .maybeSingle();
      row = data;
    }

    if (!row) return json({ ok: false, error: "pool_not_found" }, 404);

    const networkConfig = await validateChain(supabase, Number(row.chain_id));
    if (!networkConfig?.rpc_url) return json({ ok: false, error: "rpc_not_configured" }, 400);

    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const controller = getRewardsController(row.controller_address, provider);

    const pool = await readRewardPool(controller, Number(row.pool_id));
    if (!pool.exists) return json({ ok: false, error: "pool_not_found_on_chain" }, 400);

    const positions = await readRewardPositions(controller, Number(row.pool_id), pool.positionCount);
    const nowSecs = Math.floor(Date.now() / 1000);

    const { error: poolErr } = await supabase
      .from("reward_pools")
      .update({
        claimed_amount_wei: pool.claimedAmountWei,
        claim_end: epochToIso(pool.claimEnd),
        frozen_accrued_secs: pool.frozenAccrued,
        frozen: pool.frozen,
        status: deriveRewardPoolStatus(pool, nowSecs),
      })
      .eq("id", row.id);
    if (poolErr) return json({ ok: false, error: poolErr.message }, 400);

    if (positions.length > 0) {
      const { error: posErr } = await supabase
        .from("reward_pool_positions")
        .upsert(
          positions.map((p) => ({
            reward_pool_id: row.id,
            placement: p.placement,
            amount_wei: p.amountWei,
            winner_address: p.winner,
            assigned_at: epochToIso(p.assignedAt),
            hold_until: epochToIso(p.holdUntil),
            claimed: p.claimed,
            claimed_at: epochToIso(p.claimedAt),
          })),
          { onConflict: "reward_pool_id,placement" },
        );
      if (posErr) return json({ ok: false, error: posErr.message }, 400);
    }

    return json({ ok: true, pool_id: row.id, status: deriveRewardPoolStatus(pool, nowSecs) }, 200);
  } catch (err: any) {
    console.error("[sync-reward-pool]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
