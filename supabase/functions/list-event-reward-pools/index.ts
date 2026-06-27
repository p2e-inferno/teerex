/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";

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
    // Public endpoint: reward terms and declared winners are public on-chain data. No auth required;
    // dispute reason text and reporter identity are NOT exposed here (see list-reward-disputes).
    const body = await req.json().catch(() => ({}));
    const eventLockAddress = String(body.event_lock_address || "").trim().toLowerCase();
    const chainId = body.chain_id != null ? Number(body.chain_id) : null;

    if (!isAddr(eventLockAddress)) return json({ ok: false, error: "Invalid event_lock_address" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase
      .from("reward_pools")
      .select(
        "id, chain_id, controller_address, pool_id, creator_address, event_lock_address, " +
          "attendance_controller_address, payout_token_address, payout_token_symbol, token_decimals, " +
          "total_funded_wei, claimed_amount_wei, claim_start, claim_end, challenge_window_secs, " +
          "frozen_accrued_secs, position_count, rules_hash, rules_uri, status, frozen, tx_hash, created_at",
      )
      .eq("event_lock_address", eventLockAddress)
      .order("created_at", { ascending: false });
    if (chainId != null && Number.isFinite(chainId)) query = query.eq("chain_id", chainId);

    const { data: pools, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!pools || pools.length === 0) return json({ ok: true, pools: [] }, 200);

    const poolIds = pools.map((p: any) => p.id);
    const [{ data: positions }, { data: managers }] = await Promise.all([
      supabase
        .from("reward_pool_positions")
        .select("reward_pool_id, placement, amount_wei, winner_address, assigned_at, hold_until, claimed, reclaimed, claimed_at")
        .in("reward_pool_id", poolIds)
        .order("placement", { ascending: true }),
      supabase
        .from("reward_pool_managers")
        .select("reward_pool_id, manager_address, active")
        .in("reward_pool_id", poolIds)
        .eq("active", true),
    ]);

    const positionsByPool = new Map<string, any[]>();
    for (const p of positions ?? []) {
      const list = positionsByPool.get(p.reward_pool_id) ?? [];
      list.push(p);
      positionsByPool.set(p.reward_pool_id, list);
    }
    const managersByPool = new Map<string, string[]>();
    for (const m of managers ?? []) {
      const list = managersByPool.get(m.reward_pool_id) ?? [];
      list.push(m.manager_address);
      managersByPool.set(m.reward_pool_id, list);
    }

    const result = pools.map((p: any) => ({
      ...p,
      positions: positionsByPool.get(p.id) ?? [],
      managers: managersByPool.get(p.id) ?? [],
    }));

    return json({ ok: true, pools: result }, 200);
  } catch (err: any) {
    console.error("[list-event-reward-pools]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
