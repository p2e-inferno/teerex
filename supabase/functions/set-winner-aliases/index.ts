/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { getRewardsController } from "../_shared/reward-pools.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);

const ALIAS_MAX = 80;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const rewardPoolId = String(body.reward_pool_id || body.id || "").trim();
    const callerAddress = String(body.caller_address || "").trim().toLowerCase();
    const rawAliases = Array.isArray(body.aliases) ? body.aliases : [];

    if (!rewardPoolId) return json({ ok: false, error: "reward_pool_id_required" }, 400);

    const aliases = rawAliases
      .map((a: any) => {
        const placement = Number(a?.placement);
        if (!Number.isInteger(placement) || placement < 1) return null;
        const trimmed = typeof a?.alias === "string" ? a.alias.trim().slice(0, ALIAS_MAX) : "";
        return { placement, alias: trimmed.length > 0 ? trimmed : null };
      })
      .filter((a: any): a is { placement: number; alias: string | null } => a !== null);

    if (aliases.length === 0) return json({ ok: false, error: "no_aliases" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pool } = await supabase
      .from("reward_pools")
      .select("id, creator_id, chain_id, controller_address, pool_id")
      .eq("id", rewardPoolId)
      .maybeSingle();

    if (!pool) return json({ ok: false, error: "pool_not_found" }, 404);

    // Aliases are cosmetic off-chain metadata; allow whoever can assign winners (creator or an
    // on-chain manager) to set them, mirroring canManageWinners on the client.
    let allowed = pool.creator_id === privyUserId;
    if (!allowed) {
      if (!isAddr(callerAddress)) return json({ ok: false, error: "forbidden" }, 403);
      // Manager authority is wallet-bound; prove the caller actually controls the address before
      // trusting it as a manager (a real manager address is public on-chain).
      await validateUserWallet(privyUserId, callerAddress, "caller_address_not_authorized_for_user");
      const networkConfig = await validateChain(supabase, Number(pool.chain_id));
      if (!networkConfig?.rpc_url) return json({ ok: false, error: "rpc_not_configured" }, 400);
      const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
      const controller = getRewardsController(pool.controller_address, provider);
      allowed = await controller.isManager(Number(pool.pool_id), callerAddress);
    }
    if (!allowed) return json({ ok: false, error: "forbidden" }, 403);

    // Rows are guaranteed to exist (sync-reward-pool runs before this), so UPDATE in place; this
    // avoids the amount_wei NOT NULL constraint an insert would hit.
    for (const { placement, alias } of aliases) {
      const { error } = await supabase
        .from("reward_pool_positions")
        .update({ winner_alias: alias })
        .eq("reward_pool_id", pool.id)
        .eq("placement", placement)
        .not("winner_address", "is", null);
      if (error) return json({ ok: false, error: error.message }, 400);
    }

    return json({ ok: true }, 200);
  } catch (err: any) {
    console.error("[set-winner-aliases]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
