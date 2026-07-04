/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { resolvePlayerIds } from "../_shared/leaderboards.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

async function handleListGames(supabase: any) {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("name", { ascending: true });
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, games: data ?? [] }, 200);
}

async function handleUpsertGame(supabase: any, body: any) {
  const slug = String(body.slug || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  if (!SLUG_RE.test(slug)) return json({ ok: false, error: "invalid_slug" }, 400);
  if (!name) return json({ ok: false, error: "name_required" }, 400);

  const row: Record<string, unknown> = { slug, name };
  if (body.category != null) row.category = String(body.category).trim() || null;
  if (body.cover_url != null) row.cover_url = String(body.cover_url).trim() || null;
  if (body.is_active != null) row.is_active = Boolean(body.is_active);
  if (body.scoring_profile != null) {
    const profile = body.scoring_profile;
    if (typeof profile !== "object" || Array.isArray(profile) || typeof profile.type !== "string") {
      return json({ ok: false, error: "invalid_scoring_profile" }, 400);
    }
    row.scoring_profile = profile;
  }

  const { data, error } = await supabase
    .from("games")
    .upsert(row, { onConflict: "slug" })
    .select("*")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, game: data }, 200);
}

async function handleSetGameActive(supabase: any, body: any) {
  const gameId = String(body.game_id || "").trim();
  if (!gameId) return json({ ok: false, error: "game_id_required" }, 400);

  const { data, error } = await supabase
    .from("games")
    .update({ is_active: Boolean(body.is_active) })
    .eq("id", gameId)
    .select("*")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, game: data }, 200);
}

async function handleVoidResult(supabase: any, body: any, adminId: string) {
  const resultId = String(body.result_id || "").trim();
  const reason = String(body.reason || "").trim().slice(0, 500);
  if (!resultId) return json({ ok: false, error: "result_id_required" }, 400);
  if (!reason) return json({ ok: false, error: "reason_required" }, 400);

  // Admin void is the only allowed transition out of 'final'.
  const { data, error } = await supabase
    .from("game_results")
    .update({
      status: "voided",
      void_reason: `admin:${adminId}: ${reason}`,
      voided_at: new Date().toISOString(),
    })
    .eq("id", resultId)
    .select("id, status")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, result: data }, 200);
}

async function handleUnvoidResult(supabase: any, body: any) {
  const resultId = String(body.result_id || "").trim();
  if (!resultId) return json({ ok: false, error: "result_id_required" }, 400);

  // Back to provisional (not final): the finalize cron re-runs its checks before re-finalizing.
  const { data, error } = await supabase
    .from("game_results")
    .update({ status: "provisional", void_reason: null, voided_at: null, finalized_at: null })
    .eq("id", resultId)
    .eq("status", "voided")
    .select("id, status")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, result: data }, 200);
}

const RECOMPUTE_BATCH = 500;

async function handleRecompute(supabase: any) {
  // Backfill game_id for results ingested before the organizer set the event's game.
  const { data: missingGame } = await supabase
    .from("game_results")
    .select("event_id")
    .is("game_id", null)
    .neq("status", "voided")
    .limit(RECOMPUTE_BATCH);
  const eventIds = Array.from(new Set((missingGame ?? []).map((r: any) => r.event_id)));
  let gameBackfills = 0;
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, game_id")
      .in("id", eventIds)
      .not("game_id", "is", null);
    for (const event of events ?? []) {
      const { error } = await supabase
        .from("game_results")
        .update({ game_id: event.game_id })
        .eq("event_id", event.id)
        .is("game_id", null);
      if (!error) gameBackfills++;
    }
  }

  // Re-resolve players who linked a Privy profile after ingest.
  const { data: unresolved } = await supabase
    .from("game_results")
    .select("id, wallet_address")
    .is("player_id", null)
    .neq("status", "voided")
    .limit(RECOMPUTE_BATCH);
  let resolved = 0;
  if (unresolved && unresolved.length > 0) {
    const playerIds = await resolvePlayerIds(supabase, unresolved.map((r: any) => r.wallet_address));
    for (const row of unresolved) {
      const playerId = playerIds.get(row.wallet_address);
      if (!playerId) continue;
      const { error } = await supabase
        .from("game_results")
        .update({ player_id: playerId })
        .eq("id", row.id)
        .is("player_id", null);
      if (!error) resolved++;
    }
  }

  const { data: counts, error: finalizeErr } = await supabase.rpc("finalize_game_results");
  if (finalizeErr) return json({ ok: false, error: finalizeErr.message }, 500);

  return json({
    ok: true,
    game_backfilled_events: gameBackfills,
    players_resolved: resolved,
    ...(counts ?? {}),
  }, 200);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const adminId = await ensureAdmin(req.headers);
    const body = await req.json().catch(() => ({}));
    const route = String(body.route || "").trim();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (route) {
      case "list-games":
        return await handleListGames(supabase);
      case "upsert-game":
        return await handleUpsertGame(supabase, body);
      case "set-game-active":
        return await handleSetGameActive(supabase, body);
      case "void-result":
        return await handleVoidResult(supabase, body, adminId);
      case "unvoid-result":
        return await handleUnvoidResult(supabase, body);
      case "recompute":
        return await handleRecompute(supabase);
      default:
        return json({ ok: false, error: `Unknown route: ${route || "(missing)"}` }, 400);
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("unauthorized") ? 403 : lower.includes("authorization") ? 401 : 500;
    console.error("[admin-leaderboards]", err);
    return json({ ok: false, error: message }, status);
  }
});
