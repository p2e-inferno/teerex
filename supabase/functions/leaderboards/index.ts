/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { requireEventAuthorization } from "../_shared/event-auth.ts";
import {
  DEFAULT_SCORING_PROFILE,
  computeStandings,
  pointsForPlacement,
  recomputeBoard,
  resolvePlayerIds,
  type ScoringProfile,
} from "../_shared/leaderboards.ts";
import { loadDisplayNames, validateDisplayName } from "../_shared/profiles.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);

type StandingDisplayStatus = "review_open" | "under_dispute" | "ready_to_finalize" | "final";

function deriveDisplayStatus(row: any, disputed: boolean, nowMs: number): StandingDisplayStatus {
  if (row?.status === "final") return "final";
  if (disputed) return "under_dispute";

  const holdMs = row?.hold_until ? new Date(row.hold_until).getTime() : NaN;
  if (Number.isFinite(holdMs) && holdMs <= nowMs) return "ready_to_finalize";
  return "review_open";
}

async function handleGames(supabase: any) {
  const { data, error } = await supabase
    .from("games")
    .select("id, slug, name, category, cover_url, scoring_profile")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, games: data ?? [] }, 200);
}

async function findEvent(supabase: any, body: any) {
  const eventId = body.event_id ? String(body.event_id).trim() : null;
  const lockAddress = body.lock_address ? String(body.lock_address).trim().toLowerCase() : null;

  let query = supabase
    .from("events")
    .select("id, title, lock_address, chain_id, creator_id, game_id");
  if (eventId) query = query.eq("id", eventId);
  else if (isAddr(lockAddress)) query = query.ilike("lock_address", lockAddress!);
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function loadScoringProfile(supabase: any, gameId: string | null) {
  if (!gameId) return { game: null, profile: DEFAULT_SCORING_PROFILE };
  const { data } = await supabase
    .from("games")
    .select("id, slug, name, category, cover_url, scoring_profile")
    .eq("id", gameId)
    .maybeSingle();
  if (!data) return { game: null, profile: DEFAULT_SCORING_PROFILE };
  return { game: data, profile: (data.scoring_profile ?? DEFAULT_SCORING_PROFILE) as ScoringProfile };
}

async function handleEventStandings(supabase: any, body: any) {
  const event = await findEvent(supabase, body);
  if (!event) return json({ ok: false, error: "event_not_found" }, 404);

  const { game, profile } = await loadScoringProfile(supabase, event.game_id);

  const { data: results, error: resultsErr } = await supabase
    .from("game_results")
    .select("id, event_id, reward_pool_id, wallet_address, player_id, placement, participant_count, result_kind, source, status, hold_until, occurred_at")
    .eq("event_id", event.id)
    .neq("status", "voided");
  if (resultsErr) return json({ ok: false, error: resultsErr.message }, 400);
  if (!results || results.length === 0) {
    return json({ ok: true, event_id: event.id, standings: [], game, scoring_profile: profile }, 200);
  }

  // Aliases live on reward_pool_positions (set via set-winner-aliases); disputes drive the
  // under_dispute display status. Both are keyed by the event's pools.
  const { data: pools } = await supabase
    .from("reward_pools")
    .select("id")
    .eq("event_lock_address", String(event.lock_address).toLowerCase());
  const poolIds = (pools ?? []).map((p: any) => p.id);

  const aliasByPoolPlacement = new Map<string, string>();
  let openDisputes: any[] = [];
  if (poolIds.length > 0) {
    const [{ data: positions }, { data: disputes }] = await Promise.all([
      supabase
        .from("reward_pool_positions")
        .select("reward_pool_id, placement, winner_alias")
        .in("reward_pool_id", poolIds)
        .not("winner_alias", "is", null),
      supabase
        .from("reward_pool_disputes")
        .select("reward_pool_id, placement, category")
        .in("reward_pool_id", poolIds)
        .in("status", ["open", "under_review"]),
    ]);
    for (const p of positions ?? []) {
      aliasByPoolPlacement.set(`${p.reward_pool_id}:${p.placement}`, p.winner_alias);
    }
    openDisputes = disputes ?? [];
  }

  const sheetDisputed = openDisputes.some((d) => d.category === "standings" || d.placement == null);
  const disputedPlacements = new Set(
    openDisputes
      .filter((d) => d.placement != null && d.category !== "standings")
      .map((d) => `${d.reward_pool_id}:${d.placement}`),
  );

  const entries = computeStandings(results as any, profile);
  const resultById = new Map(results.map((r: any) => [r.id, r]));
  const nowMs = Date.now();

  const displayNames = await loadDisplayNames(
    supabase,
    entries.map((e) => e.player_id).filter(Boolean) as string[],
  );

  const standings = entries.map((entry) => {
    const row = resultById.get(entry.result_id);
    const poolAlias = row?.reward_pool_id
      ? aliasByPoolPlacement.get(`${row.reward_pool_id}:${row.placement}`) ?? null
      : null;
    const alias = poolAlias ?? (entry.player_id ? displayNames.get(entry.player_id) ?? null : null);
    const disputed = row?.reward_pool_id
      ? disputedPlacements.has(`${row.reward_pool_id}:${row.placement}`) || sheetDisputed
      : entry.source === "organizer" && entry.placement != null && sheetDisputed;
    return {
      ...entry,
      alias,
      display_status: deriveDisplayStatus(row, disputed, nowMs),
      participant_count: row?.participant_count ?? null,
    };
  });

  return json(
    { ok: true, event_id: event.id, standings, game, scoring_profile: profile },
    200,
  );
}

async function handlePlayer(supabase: any, body: any) {
  const playerId = body.player_id ? String(body.player_id).trim() : null;
  const wallet = body.wallet ? String(body.wallet).trim().toLowerCase() : null;
  if (!playerId && !isAddr(wallet)) return json({ ok: false, error: "player_id_or_wallet_required" }, 400);

  let query = supabase
    .from("game_results")
    .select("id, game_id, event_id, wallet_address, player_id, placement, result_kind, source, status, occurred_at, finalized_at")
    .eq("status", "final")
    .order("finalized_at", { ascending: false })
    .limit(200);
  if (playerId) query = query.eq("player_id", playerId);
  else query = query.eq("wallet_address", wallet!);

  const { data: results, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 400);

  const gameIds = Array.from(new Set((results ?? []).map((r: any) => r.game_id).filter(Boolean)));
  const profiles = new Map<string, ScoringProfile>();
  const gamesById = new Map<string, any>();
  if (gameIds.length > 0) {
    const { data: games } = await supabase
      .from("games")
      .select("id, slug, name, scoring_profile")
      .in("id", gameIds);
    for (const g of games ?? []) {
      profiles.set(g.id, g.scoring_profile ?? DEFAULT_SCORING_PROFILE);
      gamesById.set(g.id, { id: g.id, slug: g.slug, name: g.name });
    }
  }

  const rows = (results ?? []).map((r: any) => {
    const profile = (r.game_id && profiles.get(r.game_id)) || DEFAULT_SCORING_PROFILE;
    const points = r.result_kind === "participation"
      ? Number(profile.participation ?? 0)
      : pointsForPlacement(r.placement, profile);
    return { ...r, points, game: r.game_id ? gamesById.get(r.game_id) ?? null : null };
  });

  const totalsByGame: Record<string, { points: number; events: number; wins: number }> = {};
  for (const r of rows) {
    const key = r.game_id ?? "unassigned";
    const t = totalsByGame[key] ?? { points: 0, events: 0, wins: 0 };
    t.points += r.points;
    t.events += 1;
    if (r.result_kind === "placement" && r.placement === 1) t.wins += 1;
    totalsByGame[key] = t;
  }

  return json({ ok: true, results: rows, totals_by_game: totalsByGame }, 200);
}

// Feeds the organizer's extended-placements editor: remaining ticket holders, the prize floor,
// and the current organizer sheet. Same auth boundary as submit-extended-placements.
async function handleTicketHolders(supabase: any, req: Request, body: any) {
  const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));

  const event = await findEvent(supabase, body);
  if (!event) return json({ ok: false, error: "event_not_found" }, 404);

  await requireEventAuthorization({
    supabase,
    event,
    privyUserId,
    permission: "manage_results",
    errorMessage: "not_authorized_to_manage_results",
  });

  const [{ data: pools }, { data: tickets, error: ticketsErr }, { data: placementRows }] =
    await Promise.all([
      supabase
        .from("reward_pools")
        .select("position_count")
        .eq("event_lock_address", String(event.lock_address).toLowerCase()),
      supabase
        .from("tickets")
        .select("owner_wallet, granted_at")
        .eq("event_id", event.id)
        .eq("status", "active"),
      supabase
        .from("game_results")
        .select("wallet_address, placement, source, status")
        .eq("event_id", event.id)
        .eq("result_kind", "placement")
        .neq("status", "voided"),
    ]);
  if (ticketsErr) return json({ ok: false, error: ticketsErr.message }, 400);

  const prizeFloor = (pools ?? []).reduce(
    (max: number, p: any) => Math.max(max, Number(p.position_count) || 0),
    0,
  );

  const prizeWallets = new Set(
    (placementRows ?? [])
      .filter((r: any) => r.source === "reward_pool")
      .map((r: any) => String(r.wallet_address).toLowerCase()),
  );
  const organizerEntries = (placementRows ?? [])
    .filter((r: any) => r.source === "organizer")
    .map((r: any) => ({
      wallet: String(r.wallet_address).toLowerCase(),
      placement: r.placement,
      status: r.status,
    }))
    .sort((a: any, b: any) => a.placement - b.placement);

  const holderByWallet = new Map<string, string | null>();
  for (const t of tickets ?? []) {
    const wallet = String(t.owner_wallet || "").toLowerCase();
    if (!wallet || prizeWallets.has(wallet)) continue;
    const prev = holderByWallet.get(wallet);
    if (prev === undefined || (t.granted_at && (!prev || t.granted_at < prev))) {
      holderByWallet.set(wallet, t.granted_at ?? prev ?? null);
    }
  }
  const holders = Array.from(holderByWallet, ([wallet, granted_at]) => ({ wallet, granted_at }))
    .sort((a, b) => String(a.granted_at ?? "") < String(b.granted_at ?? "") ? -1 : 1);

  return json({
    ok: true,
    event_id: event.id,
    prize_floor: prizeFloor,
    holders,
    entries: organizerEntries,
    sheet_final: organizerEntries.some((e: any) => e.status === "final"),
  }, 200);
}

async function handleSubmitExtendedPlacements(supabase: any, req: Request, body: any) {
  const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));

  const event = await findEvent(supabase, body);
  if (!event) return json({ ok: false, error: "event_not_found" }, 404);

  await requireEventAuthorization({
    supabase,
    event,
    privyUserId,
    permission: "manage_results",
    errorMessage: "not_authorized_to_manage_results",
  });

  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  const entries = rawEntries.map((e: any) => ({
    wallet: String(e?.wallet || "").trim().toLowerCase(),
    placement: Number(e?.placement),
  }));
  if (entries.some((e: any) => !isAddr(e.wallet) || !Number.isInteger(e.placement) || e.placement < 1)) {
    return json({ ok: false, error: "invalid_entries" }, 400);
  }

  const playerIds = await resolvePlayerIds(supabase, entries.map((e: any) => e.wallet));
  const enriched = entries.map((e: any) => ({
    ...e,
    player_id: playerIds.get(e.wallet) ?? "",
  }));

  const { data: count, error } = await supabase.rpc("submit_extended_placements", {
    p_event_id: event.id,
    p_entries: enriched,
  });
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({ ok: true, submitted: count ?? enriched.length }, 200);
}

const BOARD_SELECT =
  "id, scope, game_id, organizer_id, name, season_label, starts_at, ends_at, scoring_profile, is_active, last_recomputed_at, created_at";

const isIsoDate = (v: unknown) => typeof v === "string" && Number.isFinite(new Date(v).getTime());

function parseSeriesFields(body: any): { fields: Record<string, unknown>; error?: string } {
  const fields: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 80) return { fields, error: "invalid_name" };
    fields.name = name;
  }
  if (body.season_label !== undefined) {
    const label = String(body.season_label || "").trim();
    fields.season_label = label || null;
  }
  for (const key of ["starts_at", "ends_at"] as const) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === "") fields[key] = null;
    else if (isIsoDate(body[key])) fields[key] = new Date(body[key]).toISOString();
    else return { fields, error: `invalid_${key}` };
  }
  if (fields.starts_at && fields.ends_at && String(fields.starts_at) >= String(fields.ends_at)) {
    return { fields, error: "invalid_season_window" };
  }
  if (body.scoring_profile !== undefined) {
    const profile = body.scoring_profile;
    if (profile === null) fields.scoring_profile = null;
    else if (typeof profile === "object" && !Array.isArray(profile) && typeof profile.type === "string") {
      fields.scoring_profile = profile;
    } else return { fields, error: "invalid_scoring_profile" };
  }
  if (body.is_active !== undefined) fields.is_active = Boolean(body.is_active);

  return { fields };
}

async function handleSeries(supabase: any, body: any) {
  let query = supabase
    .from("leaderboard_boards")
    .select(BOARD_SELECT)
    .eq("scope", "organizer_circuit")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (body.organizer_id) query = query.eq("organizer_id", String(body.organizer_id).trim());
  if (body.game_id) query = query.eq("game_id", String(body.game_id).trim());

  const { data, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, series: data ?? [] }, 200);
}

async function handleSeriesStandings(supabase: any, body: any) {
  const boardId = String(body.board_id || "").trim();
  if (!boardId) return json({ ok: false, error: "board_id_required" }, 400);

  const { data: board, error: boardErr } = await supabase
    .from("leaderboard_boards")
    .select(BOARD_SELECT)
    .eq("id", boardId)
    .maybeSingle();
  if (boardErr) return json({ ok: false, error: boardErr.message }, 400);
  if (!board) return json({ ok: false, error: "board_not_found" }, 404);

  const [{ game, profile }, { data: rows, error: rowsErr }] = await Promise.all([
    loadScoringProfile(supabase, board.game_id),
    supabase
      .from("leaderboard_standings")
      .select("player_key, player_id, wallet_address, rank, points, events_played, wins, computed_at")
      .eq("board_id", boardId)
      .order("rank", { ascending: true })
      .order("wins", { ascending: false })
      .limit(500),
  ]);
  if (rowsErr) return json({ ok: false, error: rowsErr.message }, 400);

  const displayNames = await loadDisplayNames(
    supabase,
    (rows ?? []).map((r: any) => r.player_id).filter(Boolean),
  );
  const standings = (rows ?? []).map((r: any) => ({
    ...r,
    display_name: r.player_id ? displayNames.get(r.player_id) ?? null : null,
  }));

  return json({
    ok: true,
    board,
    game,
    scoring_profile: (board.scoring_profile as ScoringProfile) ?? profile,
    standings,
  }, 200);
}

async function handleMySeries(supabase: any, req: Request) {
  const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));

  const { data, error } = await supabase
    .from("leaderboard_boards")
    .select(BOARD_SELECT)
    .eq("scope", "organizer_circuit")
    .eq("organizer_id", privyUserId)
    .order("created_at", { ascending: false });
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, series: data ?? [] }, 200);
}

async function handleCreateSeries(supabase: any, req: Request, body: any) {
  const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));

  const gameId = String(body.game_id || "").trim();
  if (!gameId) return json({ ok: false, error: "game_id_required" }, 400);
  const { data: game } = await supabase
    .from("games")
    .select("id")
    .eq("id", gameId)
    .eq("is_active", true)
    .maybeSingle();
  if (!game) return json({ ok: false, error: "game_not_found" }, 404);

  const { fields, error: fieldErr } = parseSeriesFields(body);
  if (fieldErr) return json({ ok: false, error: fieldErr }, 400);
  if (!fields.name) return json({ ok: false, error: "invalid_name" }, 400);

  const { data: board, error } = await supabase
    .from("leaderboard_boards")
    .insert({ ...fields, scope: "organizer_circuit", game_id: gameId, organizer_id: privyUserId })
    .select(BOARD_SELECT)
    .single();
  if (error) {
    const status = String(error.code) === "23505" ? 409 : 400;
    const message = status === 409 ? "A series with this name already exists." : error.message;
    return json({ ok: false, error: message }, status);
  }

  // Populate from already-final results; a recompute failure must not undo the creation.
  try {
    await recomputeBoard(supabase, board);
  } catch (err: any) {
    console.error(`[leaderboards] initial recompute failed for board ${board.id} (swallowed):`, err?.message || err);
  }

  return json({ ok: true, series: board }, 200);
}

async function handleUpdateSeries(supabase: any, req: Request, body: any) {
  const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));

  const boardId = String(body.board_id || "").trim();
  if (!boardId) return json({ ok: false, error: "board_id_required" }, 400);

  const { data: existing } = await supabase
    .from("leaderboard_boards")
    .select("id, organizer_id, scope")
    .eq("id", boardId)
    .maybeSingle();
  if (!existing || existing.scope !== "organizer_circuit") {
    return json({ ok: false, error: "board_not_found" }, 404);
  }
  if (existing.organizer_id !== privyUserId) {
    return json({ ok: false, error: "You don't have permission to manage this series." }, 403);
  }

  const { fields, error: fieldErr } = parseSeriesFields(body);
  if (fieldErr) return json({ ok: false, error: fieldErr }, 400);
  if (Object.keys(fields).length === 0) return json({ ok: false, error: "no_fields_to_update" }, 400);

  const { data: board, error } = await supabase
    .from("leaderboard_boards")
    .update(fields)
    .eq("id", boardId)
    .select(BOARD_SELECT)
    .single();
  if (error) {
    const status = String(error.code) === "23505" ? 409 : 400;
    const message = status === 409 ? "A series with this name already exists." : error.message;
    return json({ ok: false, error: message }, status);
  }

  // Reactivation also recomputes: the board may have gone stale while inactive.
  const needsRecompute =
    "starts_at" in fields || "ends_at" in fields || "scoring_profile" in fields ||
    fields.is_active === true;
  if (needsRecompute && board.is_active) {
    try {
      await recomputeBoard(supabase, board);
    } catch (err: any) {
      console.error(`[leaderboards] recompute failed for board ${board.id} (swallowed):`, err?.message || err);
    }
  }

  return json({ ok: true, series: board }, 200);
}

async function handleMyDisplayName(supabase: any, req: Request) {
  const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));

  const { data, error } = await supabase
    .from("app_user_profiles")
    .select("display_name")
    .eq("privy_user_id", privyUserId)
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({ ok: true, display_name: data?.display_name ?? null }, 200);
}

async function handleSetDisplayName(supabase: any, req: Request, body: any) {
  const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));

  const raw = body.display_name;
  const displayName = raw == null ? null : String(raw).trim();
  const validationError = validateDisplayName(displayName);
  if (validationError) {
    return json({ ok: false, error: validationError }, 400);
  }

  const { error } = await supabase
    .from("app_user_profiles")
    .upsert(
      { privy_user_id: privyUserId, display_name: displayName },
      { onConflict: "privy_user_id" },
    );
  if (error) {
    if (String(error.code) === "23505") {
      return json({ ok: false, error: "display_name_taken" }, 409);
    }
    if (String(error.code) === "23514") {
      return json({ ok: false, error: "display_name_invalid" }, 400);
    }
    return json({ ok: false, error: error.message }, 400);
  }

  return json({ ok: true, display_name: displayName }, 200);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const route = String(body.route || "").trim();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Read routes are public: standings mirror on-chain winners and organizer-published results.
    // Write routes authenticate the Privy caller and authorize per event/board inside their handlers.
    switch (route) {
      case "games":
        return await handleGames(supabase);
      case "event-standings":
        return await handleEventStandings(supabase, body);
      case "player":
        return await handlePlayer(supabase, body);
      case "ticket-holders":
        return await handleTicketHolders(supabase, req, body);
      case "submit-extended-placements":
        return await handleSubmitExtendedPlacements(supabase, req, body);
      case "series":
        return await handleSeries(supabase, body);
      case "series-standings":
        return await handleSeriesStandings(supabase, body);
      case "my-series":
        return await handleMySeries(supabase, req);
      case "create-series":
        return await handleCreateSeries(supabase, req, body);
      case "update-series":
        return await handleUpdateSeries(supabase, req, body);
      case "my-display-name":
        return await handleMyDisplayName(supabase, req);
      case "set-display-name":
        return await handleSetDisplayName(supabase, req, body);
      default:
        return json({ ok: false, error: `Unknown route: ${route || "(missing)"}` }, 400);
    }
  } catch (err: any) {
    console.error("[leaderboards]", err);
    const status = Number(err?.status) || 500;
    return json({ ok: false, error: err?.message || "Internal error" }, status);
  }
});
