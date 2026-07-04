/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { sendEmail } from "../_shared/email-utils.ts";
import PublicLockAbi from "../_shared/abi/PublicLockV15.json" assert { type: "json" };

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);
const CATEGORIES = ["wrong_winner", "rules_breach", "collusion", "not_paid", "standings", "other"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));

    const rewardPoolId = String(body.reward_pool_id || body.id || "").trim();
    const disputerAddress = String(body.disputer_address || "").trim().toLowerCase();
    const placement = body.placement != null && Number(body.placement) > 0 ? Number(body.placement) : null;
    const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "other";
    const reasonText = body.reason_text ? String(body.reason_text).trim().slice(0, 4000) : null;
    const evidenceUrls = Array.isArray(body.evidence_urls)
      ? body.evidence_urls.map((u: unknown) => String(u || "").trim()).filter(Boolean).slice(0, 20)
      : [];
    const onchainTxHash = body.onchain_tx_hash ? String(body.onchain_tx_hash).trim() : null;

    if (!rewardPoolId) return json({ ok: false, error: "reward_pool_id_required" }, 400);
    if (!isAddr(disputerAddress)) return json({ ok: false, error: "Invalid disputer_address" }, 400);

    await validateUserWallet(privyUserId, disputerAddress, "disputer_address_not_authorized_for_user");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pool } = await supabase
      .from("reward_pools")
      .select("id, chain_id, controller_address, pool_id, event_lock_address, position_count")
      .eq("id", rewardPoolId)
      .maybeSingle();
    if (!pool) return json({ ok: false, error: "pool_not_found" }, 404);
    if (placement != null && placement > Number(pool.position_count)) {
      return json({ ok: false, error: "Invalid placement" }, 400);
    }

    const networkConfig = await validateChain(supabase, Number(pool.chain_id));
    if (!networkConfig?.rpc_url) return json({ ok: false, error: "rpc_not_configured" }, 400);

    // Only ticket holders of the associated event may dispute.
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const lock = new ethers.Contract(pool.event_lock_address, PublicLockAbi as any, provider);
    const balance: bigint = await lock.balanceOf(disputerAddress).catch(() => 0n);
    if (balance <= 0n) return json({ ok: false, error: "not_a_ticket_holder" }, 403);

    const reasonHash = body.reason_hash
      ? String(body.reason_hash).trim()
      : ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ category, reasonText, placement })));

    const { data: dispute, error } = await supabase
      .from("reward_pool_disputes")
      .insert({
        reward_pool_id: pool.id,
        placement,
        disputer_id: privyUserId,
        disputer_address: disputerAddress,
        category,
        reason_text: reasonText,
        evidence_urls: evidenceUrls,
        reason_hash: reasonHash,
        status: "open",
        onchain_tx_hash: onchainTxHash,
      })
      .select("*")
      .single();

    if (error) return json({ ok: false, error: error.message }, 400);

    // Notify the arbitrator/admin so disputes get a fast response. The dispute row already persists,
    // so a failed email is logged-and-swallowed (it must not undo a valid dispute).
    const opsEmail = Deno.env.get("OPS_ALERT_EMAIL");
    if (opsEmail) {
      const text = [
        "A ticket holder raised a reward-pool dispute.",
        "",
        `Dispute ID: ${dispute.id}`,
        `Reward pool: ${pool.id} (on-chain pool ${pool.pool_id}, chain ${pool.chain_id})`,
        `Event lock: ${pool.event_lock_address}`,
        `Placement: ${placement ?? "pool-level"}`,
        `Category: ${category}`,
        `Reporter: ${disputerAddress}`,
        `On-chain signal tx: ${onchainTxHash || "none"}`,
        "",
        "Review it in the reward-pool admin dashboard and freeze / void / reassign as appropriate.",
      ].join("\n");
      const result = await sendEmail({
        to: opsEmail,
        subject: `Reward dispute raised: pool ${pool.pool_id} (${category})`,
        text,
        tags: ["reward-pool", "dispute"],
      }).catch((e) => ({ ok: false, error: String(e) }));
      if (!result.ok) console.error("[raise-reward-dispute] admin email failed:", (result as any).error);
    }

    return json({ ok: true, dispute }, 200);
  } catch (err: any) {
    console.error("[raise-reward-dispute]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
