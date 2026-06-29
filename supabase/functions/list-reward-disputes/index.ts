/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import PublicLockAbi from "../_shared/abi/PublicLockV15.json" assert { type: "json" };

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
    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const rewardPoolId = String(body.reward_pool_id || body.id || "").trim();
    const requesterAddress = body.requester_address
      ? String(body.requester_address).trim().toLowerCase()
      : null;

    if (!rewardPoolId) return json({ ok: false, error: "reward_pool_id_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pool } = await supabase
      .from("reward_pools")
      .select("id, creator_id, chain_id, event_lock_address")
      .eq("id", rewardPoolId)
      .maybeSingle();
    if (!pool) return json({ ok: false, error: "pool_not_found" }, 404);

    const isCreator = pool.creator_id === privyUserId;

    // Access is gated to stakeholders: the pool creator or a ticket holder of the event.
    let isTicketHolder = false;
    if (!isCreator && requesterAddress && isAddr(requesterAddress)) {
      await validateUserWallet(privyUserId, requesterAddress, "requester_address_not_authorized_for_user");
      const networkConfig = await validateChain(supabase, Number(pool.chain_id));
      if (networkConfig?.rpc_url) {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
        const lock = new ethers.Contract(pool.event_lock_address, PublicLockAbi as any, provider);
        const balance: bigint = await lock.balanceOf(requesterAddress).catch(() => 0n);
        isTicketHolder = balance > 0n;
      }
    }

    if (!isCreator && !isTicketHolder) return json({ ok: false, error: "forbidden" }, 403);

    const { data: disputes, error } = await supabase
      .from("reward_pool_disputes")
      .select(
        "id, placement, disputer_id, disputer_address, category, reason_text, evidence_urls, " +
          "status, resolution_note, resolved_at, created_at",
      )
      .eq("reward_pool_id", pool.id)
      .order("created_at", { ascending: false });
    if (error) return json({ ok: false, error: error.message }, 400);

    // Per-row visibility: reason/evidence to the creator (to respond) and the reporter; reporter
    // identity only to the reporter themselves. Everyone else sees just category/status/timestamps.
    const rows = (disputes ?? []).map((d: any) => {
      const isOwn = d.disputer_id === privyUserId;
      const canSeeReason = isCreator || isOwn;
      const canSeeReporter = isOwn;
      return {
        id: d.id,
        placement: d.placement,
        category: d.category,
        status: d.status,
        resolution_note: d.resolution_note,
        resolved_at: d.resolved_at,
        created_at: d.created_at,
        reason_text: canSeeReason ? d.reason_text : null,
        evidence_urls: canSeeReason ? d.evidence_urls : [],
        disputer_address: canSeeReporter ? d.disputer_address : null,
      };
    });

    return json({ ok: true, disputes: rows }, 200);
  } catch (err: any) {
    console.error("[list-reward-disputes]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
