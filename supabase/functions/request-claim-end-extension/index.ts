/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);

// Organizer-only, off-chain notify: an assignment hit AssignmentWindowClosed and the creator/manager
// is asking the arbitrator to extendClaimEnd. No on-chain effect; the contract guarantees winners'
// windows independently, so this only requests reopening assignment for a genuinely-late result.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const rewardPoolId = String(body.reward_pool_id || body.id || "").trim();
    const requesterAddress = isAddr(body.requester_address)
      ? String(body.requester_address).trim().toLowerCase()
      : null;
    if (!rewardPoolId) return json({ ok: false, error: "reward_pool_id_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pool } = await supabase
      .from("reward_pools")
      .select("id, creator_id, chain_id, controller_address, pool_id, event_lock_address, claim_end")
      .eq("id", rewardPoolId)
      .maybeSingle();
    if (!pool) return json({ ok: false, error: "pool_not_found" }, 404);

    // Authorize: the pool creator, or a reward manager proving the wallet that holds the role.
    let authorized = pool.creator_id === privyUserId;
    if (!authorized && requesterAddress) {
      await validateUserWallet(privyUserId, requesterAddress, "requester_address_not_authorized_for_user");
      const { data: mgr } = await supabase
        .from("reward_pool_managers")
        .select("id")
        .eq("reward_pool_id", pool.id)
        .eq("manager_address", requesterAddress)
        .maybeSingle();
      authorized = Boolean(mgr);
    }
    if (!authorized) return json({ ok: false, error: "forbidden" }, 403);

    const opsEmail = Deno.env.get("OPS_ALERT_EMAIL");
    if (opsEmail) {
      const { sendEmail } = await import("../_shared/email-utils.ts");
      const text = [
        "An organizer cannot assign a winner because the reward-pool claim window has ended.",
        "They are requesting an extendClaimEnd so the assignment can proceed.",
        "",
        `Reward pool: ${pool.id} (on-chain pool ${pool.pool_id}, chain ${pool.chain_id})`,
        `Controller: ${pool.controller_address}`,
        `Event lock: ${pool.event_lock_address}`,
        `Current claim end: ${pool.claim_end}`,
        `Requested by: ${requesterAddress || "pool creator"}`,
        "",
        "If the request is legitimate, call extendClaimEnd on the controller, then the organizer can assign again.",
      ].join("\n");
      const result = await sendEmail({
        to: opsEmail,
        subject: `Claim-window extension requested: pool ${pool.pool_id}`,
        text,
        tags: ["reward-pool", "extend-claim-end"],
      }).catch((e) => ({ ok: false, error: String(e) }));
      if (!result.ok) console.error("[request-claim-end-extension] ops email failed:", (result as any).error);
    }

    return json({ ok: true }, 200);
  } catch (err: any) {
    console.error("[request-claim-end-extension]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
