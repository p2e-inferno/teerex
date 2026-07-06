/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import {
  recomputeActiveBoards,
  recomputeBoard,
  recomputeBoardsForResultChange,
  resolvePlayerIds,
} from "../_shared/leaderboards.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const BOARD_RECOMPUTE_SELECT = "id, scope, game_id, organizer_id, starts_at, ends_at, scoring_profile";

function extractAddress(value: unknown): string | null {
  const match = String(value || "").match(ADDRESS_RE);
  return match ? match[0].toLowerCase() : null;
}

async function recomputeActiveBoardsForGame(supabase: any, gameId: string): Promise<number> {
  const { data: boards, error } = await supabase
    .from("leaderboard_boards")
    .select(BOARD_RECOMPUTE_SELECT)
    .eq("game_id", gameId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  let recomputed = 0;
  for (const board of boards ?? []) {
    await recomputeBoard(supabase, board);
    recomputed++;
  }
  return recomputed;
}

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

  let boardsRecomputed = 0;
  let recomputeError: string | undefined;
  if (row.scoring_profile) {
    try {
      boardsRecomputed = await recomputeActiveBoardsForGame(supabase, data.id);
    } catch (err: any) {
      recomputeError = err?.message || "board_recompute_failed";
      console.error(`[admin-leaderboards] game ${data.id} board recompute failed:`, recomputeError);
    }
  }

  return json({ ok: true, game: data, boards_recomputed: boardsRecomputed, recompute_error: recomputeError }, 200);
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

async function handleEventResults(supabase: any, body: any) {
  const lockAddress = extractAddress(body.lock_address || body.event_url);
  if (!lockAddress) return json({ ok: false, error: "valid_lock_address_required" }, 400);

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("id, title, lock_address, chain_id, creator_id, game_id")
    .ilike("lock_address", lockAddress)
    .maybeSingle();
  if (eventErr) return json({ ok: false, error: eventErr.message }, 400);
  if (!event) return json({ ok: false, error: "event_not_found" }, 404);

  const [{ data: results, error: resultsErr }, { data: game }] = await Promise.all([
    supabase
      .from("game_results")
      .select(
        "id, event_id, game_id, reward_pool_id, wallet_address, player_id, placement, participant_count, " +
        "result_kind, source, status, occurred_at, hold_until, finalized_at, voided_at, void_reason, metadata",
      )
      .eq("event_id", event.id)
      .order("created_at", { ascending: true }),
    event.game_id
      ? supabase.from("games").select("id, slug, name").eq("id", event.game_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (resultsErr) return json({ ok: false, error: resultsErr.message }, 400);

  const rows = results ?? [];
  const poolIds = Array.from(new Set(rows.map((r: any) => r.reward_pool_id).filter(Boolean)));
  const playerIds = Array.from(new Set(rows.map((r: any) => r.player_id).filter(Boolean)));

  const aliasByPoolPlacement = new Map<string, string>();
  const displayNames = new Map<string, string>();
  await Promise.all([
    (async () => {
      if (poolIds.length === 0) return;
      const { data } = await supabase
        .from("reward_pool_positions")
        .select("reward_pool_id, placement, winner_alias")
        .in("reward_pool_id", poolIds)
        .not("winner_alias", "is", null);
      for (const pos of data ?? []) {
        aliasByPoolPlacement.set(`${pos.reward_pool_id}:${pos.placement}`, pos.winner_alias);
      }
    })(),
    (async () => {
      if (playerIds.length === 0) return;
      const { data } = await supabase
        .from("app_user_profiles")
        .select("privy_user_id, display_name")
        .in("privy_user_id", playerIds)
        .not("display_name", "is", null);
      for (const profile of data ?? []) {
        displayNames.set(profile.privy_user_id, profile.display_name);
      }
    })(),
  ]);

  const sorted = [...rows].sort((a: any, b: any) => {
    const aPlacement = a.placement == null ? Number.MAX_SAFE_INTEGER : Number(a.placement);
    const bPlacement = b.placement == null ? Number.MAX_SAFE_INTEGER : Number(b.placement);
    if (aPlacement !== bPlacement) return aPlacement - bPlacement;
    return String(a.source).localeCompare(String(b.source)) || String(a.wallet_address).localeCompare(String(b.wallet_address));
  });

  const resultRows = sorted.map((row: any) => {
    const poolAlias = row.reward_pool_id
      ? aliasByPoolPlacement.get(`${row.reward_pool_id}:${row.placement}`) ?? null
      : null;
    const displayName = row.player_id ? displayNames.get(row.player_id) ?? null : null;
    return {
      id: row.id,
      event_id: row.event_id,
      game_id: row.game_id,
      reward_pool_id: row.reward_pool_id,
      wallet_address: row.wallet_address,
      player_id: row.player_id,
      placement: row.placement,
      participant_count: row.participant_count,
      result_kind: row.result_kind,
      source: row.source,
      status: row.status,
      occurred_at: row.occurred_at,
      hold_until: row.hold_until,
      finalized_at: row.finalized_at,
      voided_at: row.voided_at,
      void_reason: row.void_reason,
      label: poolAlias ?? displayName ?? null,
    };
  });

  return json({ ok: true, event, game: game ?? null, results: resultRows }, 200);
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
    .select("id, event_id, game_id, organizer_id, status")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);

  const boardsRecomputed = await recomputeBoardsForResultChange(supabase, data);
  return json({ ok: true, result: data, boards_recomputed: boardsRecomputed }, 200);
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
    .select("id, event_id, game_id, organizer_id, status")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);

  const boardsRecomputed = await recomputeBoardsForResultChange(supabase, data);
  return json({ ok: true, result: data, boards_recomputed: boardsRecomputed }, 200);
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
  const boardsRecomputed = await recomputeActiveBoards(supabase);

  return json({
    ok: true,
    game_backfilled_events: gameBackfills,
    players_resolved: resolved,
    boards_recomputed: boardsRecomputed,
    ...(counts ?? {}),
  }, 200);
}

async function handleRecomputeBoard(supabase: any, body: any) {
  const boardId = String(body.board_id || "").trim();
  if (!boardId) {
    const recomputed = await recomputeActiveBoards(supabase);
    return json({ ok: true, boards_recomputed: recomputed }, 200);
  }

  const { data: board, error } = await supabase
    .from("leaderboard_boards")
    .select(BOARD_RECOMPUTE_SELECT)
    .eq("id", boardId)
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);
  if (!board) return json({ ok: false, error: "board_not_found" }, 404);

  const standings = await recomputeBoard(supabase, board);
  return json({ ok: true, board_id: boardId, standings_rows: standings }, 200);
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
      case "event-results":
        return await handleEventResults(supabase, body);
      case "void-result":
        return await handleVoidResult(supabase, body, adminId);
      case "unvoid-result":
        return await handleUnvoidResult(supabase, body);
      case "recompute":
        return await handleRecompute(supabase);
      case "recompute-board":
        return await handleRecomputeBoard(supabase, body);
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
