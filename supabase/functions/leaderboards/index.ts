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
  resolvePlayerIds,
  type ScoringProfile,
} from "../_shared/leaderboards.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);

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

  const standings = entries.map((entry) => {
    const row = resultById.get(entry.result_id);
    const alias = row?.reward_pool_id
      ? aliasByPoolPlacement.get(`${row.reward_pool_id}:${row.placement}`) ?? null
      : null;
    const disputed = row?.reward_pool_id
      ? disputedPlacements.has(`${row.reward_pool_id}:${row.placement}`) || sheetDisputed
      : entry.source === "organizer" && entry.placement != null && sheetDisputed;
    return {
      ...entry,
      alias,
      display_status: entry.status === "provisional" && disputed ? "under_dispute" : entry.status,
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
  if (entries.length === 0) return json({ ok: false, error: "entries_required" }, 400);
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const route = String(body.route || "").trim();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Read routes are public: standings mirror on-chain winners and organizer-published results.
    // The single write route authenticates and authorizes per event inside its handler.
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
      default:
        return json({ ok: false, error: `Unknown route: ${route || "(missing)"}` }, 400);
    }
  } catch (err: any) {
    console.error("[leaderboards]", err);
    const status = Number(err?.status) || 500;
    return json({ ok: false, error: err?.message || "Internal error" }, status);
  }
});
