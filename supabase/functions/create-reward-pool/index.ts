/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import {
  getLegacyRewardsController,
  getRewardsController,
  readRewardPool,
  readRewardPositions,
  deriveRewardPoolStatus,
  epochToIso,
} from "../_shared/reward-pools.ts";
import { ingestRewardPoolResults } from "../_shared/leaderboards.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);

async function findExistingPool(
  supabase: any,
  chainId: number,
  controllerAddress: string,
  poolId: number,
) {
  const { data, error } = await supabase
    .from("reward_pools")
    .select("*")
    .eq("chain_id", chainId)
    .eq("controller_address", controllerAddress)
    .eq("pool_id", poolId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const chainId = Number(body.chain_id);
    const poolId = Number(body.pool_id);
    const controllerAddress = String(body.controller_address || "").trim().toLowerCase();
    const creatorAddress = String(body.creator_address || "").trim().toLowerCase();
    const payoutTokenSymbol = body.payout_token_symbol ? String(body.payout_token_symbol).trim() : null;
    const tokenDecimals = body.token_decimals != null ? Number(body.token_decimals) : null;
    const rulesUri = body.rules_uri ? String(body.rules_uri).trim() : null;
    const txHash = body.tx_hash ? String(body.tx_hash).trim() : null;
    const initialManagers: string[] = Array.isArray(body.initial_managers)
      ? body.initial_managers.map((m: unknown) => String(m || "").trim().toLowerCase()).filter(isAddr)
      : [];

    if (!Number.isFinite(chainId)) return json({ ok: false, error: "Invalid chain_id" }, 400);
    if (!Number.isInteger(poolId) || poolId < 0) return json({ ok: false, error: "Invalid pool_id" }, 400);
    if (!isAddr(controllerAddress)) return json({ ok: false, error: "Invalid controller_address" }, 400);
    if (!isAddr(creatorAddress)) return json({ ok: false, error: "Invalid creator_address" }, 400);

    // The creator wallet must belong to the authenticated user.
    await validateUserWallet(privyUserId, creatorAddress, "creator_address_not_authorized_for_user");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const networkConfig = await validateChain(supabase, chainId);
    if (!networkConfig?.rpc_url) return json({ ok: false, error: "rpc_not_configured" }, 400);
    if (
      networkConfig.rewards_controller_address &&
      networkConfig.rewards_controller_address.toLowerCase() !== controllerAddress
    ) {
      return json({ ok: false, error: "controller_address_not_recognized" }, 400);
    }

    // ---- on-chain integrity verification (mirror exactly what the contract holds) ----
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const controller = getRewardsController(controllerAddress, provider);
    const legacyController = getLegacyRewardsController(controllerAddress, provider);

    const pool = await readRewardPool(controller, poolId);
    if (!pool.exists) return json({ ok: false, error: "pool_not_found_on_chain" }, 400);
    if (pool.creator !== creatorAddress) return json({ ok: false, error: "creator_mismatch_on_chain" }, 400);

    const positions = await readRewardPositions(controller, poolId, pool.positionCount, legacyController);

    // Derive display metadata from the on-chain payout token rather than trusting the client.
    // (The token address itself is already authoritative — read from the contract above.)
    let derivedSymbol: string | null = null;
    let derivedDecimals: number | null = null;
    if (pool.payoutToken) {
      const erc20 = new ethers.Contract(
        pool.payoutToken,
        ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
        provider,
      );
      const d = Number(await erc20.decimals().catch(() => NaN));
      derivedDecimals = Number.isFinite(d) ? d : null;
      derivedSymbol = await erc20.symbol().catch(() => null);
    }

    // Only mirror managers the contract actually recognizes for this pool.
    const verifiedManagers: string[] = [];
    for (const m of Array.from(new Set(initialManagers))) {
      const ok = await controller.isManager(poolId, m).catch(() => false);
      if (ok) verifiedManagers.push(m);
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const poolRow = {
      chain_id: chainId,
      controller_address: controllerAddress,
      pool_id: poolId,
      creator_id: privyUserId,
      creator_address: creatorAddress,
      event_lock_address: pool.eventLock,
      attendance_controller_address: pool.attendanceController ?? "",
      payout_token_address: pool.payoutToken ?? "",
      payout_token_symbol: (derivedSymbol ?? payoutTokenSymbol) ?? "",
      token_decimals: (derivedDecimals ?? tokenDecimals) ?? "",
      total_funded_wei: pool.totalFundedWei,
      claimed_amount_wei: pool.claimedAmountWei,
      claim_start: epochToIso(pool.claimStart),
      claim_end: epochToIso(pool.claimEnd),
      challenge_window_secs: pool.challengeWindow,
      frozen_accrued_secs: pool.frozenAccrued,
      position_count: pool.positionCount,
      rules_hash: pool.rulesHash,
      rules_uri: rulesUri ?? "",
      status: deriveRewardPoolStatus(pool, nowSecs),
      frozen: pool.frozen,
      tx_hash: txHash ?? "",
    };

    const positionRows = positions.map((p) => ({
      placement: p.placement,
      amount_wei: p.amountWei,
      winner_address: p.winner ?? "",
      assigned_at: epochToIso(p.assignedAt) ?? "",
      hold_until: epochToIso(p.holdUntil) ?? "",
      claimed: p.claimed,
      reclaimed: p.reclaimed,
      claimed_at: epochToIso(p.claimedAt) ?? "",
    }));

    const managerRows = verifiedManagers.map((m) => ({ manager_address: m }));
    const existingPool = await findExistingPool(supabase, chainId, controllerAddress, poolId);
    if (existingPool) {
      return json({ ok: true, pool: existingPool, already_exists: true }, 200);
    }

    const { data, error } = await supabase.rpc("create_reward_pool_mirror", {
      p_pool: poolRow,
      p_positions: positionRows,
      p_managers: managerRows,
    });

    if (error) {
      if (error.code === "23505") {
        const racedPool = await findExistingPool(supabase, chainId, controllerAddress, poolId);
        if (racedPool) return json({ ok: true, pool: racedPool, already_exists: true }, 200);
      }
      return json({ ok: false, error: error.message }, 400);
    }

    // Covers late mirrors of pools whose winners were already assigned on-chain.
    // Logs and swallows internally — must never fail the create.
    await ingestRewardPoolResults(
      supabase,
      {
        poolDbId: data.id,
        eventLock: pool.eventLock,
        claimStart: pool.claimStart,
        challengeWindowSecs: pool.challengeWindow,
      },
      positions,
    );

    return json({ ok: true, pool: data }, 200);
  } catch (err: any) {
    console.error("[create-reward-pool]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
