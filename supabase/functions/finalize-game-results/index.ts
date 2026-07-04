/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { resolvePlayerIds } from "../_shared/leaderboards.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getActor(req: Request): Promise<string> {
  const secret = Deno.env.get("LEADERBOARDS_CRON_SECRET");
  const authorization = req.headers.get("Authorization") || "";
  if (secret && authorization === `Bearer ${secret}`) return "system";
  return await ensureAdmin(req.headers);
}

const RERESOLVE_BATCH = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    await getActor(req);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: counts, error } = await supabase.rpc("finalize_game_results");
    if (error) throw new Error(error.message);

    // Bounded re-resolution: players who linked a wallet after their result was ingested
    // absorb their history on subsequent runs.
    const { data: unresolved, error: unresolvedErr } = await supabase
      .from("game_results")
      .select("id, wallet_address")
      .is("player_id", null)
      .neq("status", "voided")
      .limit(RERESOLVE_BATCH);
    if (unresolvedErr) throw new Error(unresolvedErr.message);

    let resolvedCount = 0;
    if (unresolved && unresolved.length > 0) {
      const playerIds = await resolvePlayerIds(
        supabase,
        unresolved.map((r: any) => r.wallet_address),
      );
      for (const row of unresolved) {
        const playerId = playerIds.get(row.wallet_address);
        if (!playerId) continue;
        const { error: updateErr } = await supabase
          .from("game_results")
          .update({ player_id: playerId })
          .eq("id", row.id)
          .is("player_id", null);
        if (!updateErr) resolvedCount++;
      }
    }

    return json({ ok: true, ...(counts ?? {}), players_resolved: resolvedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("unauthorized")
      ? 403
      : lower.includes("authorization")
      ? 401
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
