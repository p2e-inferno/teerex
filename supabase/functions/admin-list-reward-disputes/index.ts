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

const ALLOWED_STATUSES = ["open", "under_review", "upheld", "rejected"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    // Arbitrator/admin only. Returns full dispute detail + pool context for the resolution console.
    await ensureAdmin(req.headers);

    const body = await req.json().catch(() => ({}));
    const statuses: string[] = Array.isArray(body.statuses)
      ? body.statuses.filter((s: unknown) => ALLOWED_STATUSES.includes(String(s)))
      : ["open", "under_review"];

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("reward_pool_disputes")
      .select(
        "id, reward_pool_id, placement, disputer_id, disputer_address, category, reason_text, " +
          "evidence_urls, reason_hash, status, resolution_note, resolved_at, created_at, onchain_tx_hash, " +
          "pool:reward_pools(pool_id, controller_address, chain_id, event_lock_address, status, frozen, position_count)",
      )
      .in("status", statuses.length ? statuses : ["open", "under_review"])
      .order("created_at", { ascending: false });

    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true, disputes: data ?? [] }, 200);
  } catch (err: any) {
    console.error("[admin-list-reward-disputes]", err);
    const lower = String(err?.message || "").toLowerCase();
    const status = lower.includes("admin") || lower.includes("unauthorized") || lower.includes("forbidden")
      ? 403
      : lower.includes("authorization") || lower.includes("token")
      ? 401
      : 400;
    return json({ ok: false, error: err?.message || "Internal error" }, status);
  }
});
