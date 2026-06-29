/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STATUSES = ["under_review", "upheld", "rejected"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    // Arbitrator/admin only. The on-chain freeze/void/reassign/resolveDispute tx is sent from the
    // arbitrator multisig; this records the off-chain resolution and anchors its hash.
    const adminId = await ensureAdmin(req.headers);

    const body = await req.json().catch(() => ({}));
    const disputeId = String(body.dispute_id || body.id || "").trim();
    const status = String(body.status || "").trim().toLowerCase();
    const resolutionNote = body.resolution_note ? String(body.resolution_note).trim().slice(0, 4000) : null;
    const resolutionHash = body.resolution_hash ? String(body.resolution_hash).trim() : null;
    const onchainTxHash = body.onchain_tx_hash ? String(body.onchain_tx_hash).trim() : null;

    if (!disputeId) return json({ ok: false, error: "dispute_id_required" }, 400);
    if (!STATUSES.includes(status)) return json({ ok: false, error: "Invalid status" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const isTerminal = status === "upheld" || status === "rejected";
    const update: Record<string, unknown> = {
      status,
      resolution_note: resolutionNote,
      resolution_hash: resolutionHash,
      resolved_by: adminId,
      resolved_at: isTerminal ? new Date().toISOString() : null,
    };
    if (onchainTxHash) update.onchain_tx_hash = onchainTxHash;

    const { data, error } = await supabase
      .from("reward_pool_disputes")
      .update(update)
      .eq("id", disputeId)
      .select("*")
      .single();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: "dispute_not_found" }, 404);

    return json({ ok: true, dispute: data }, 200);
  } catch (err: any) {
    console.error("[resolve-reward-dispute]", err);
    const lower = String(err?.message || "").toLowerCase();
    const status = lower.includes("admin") || lower.includes("unauthorized") || lower.includes("forbidden")
      ? 403
      : lower.includes("authorization") || lower.includes("token")
      ? 401
      : 400;
    return json({ ok: false, error: err?.message || "Internal error" }, status);
  }
});
