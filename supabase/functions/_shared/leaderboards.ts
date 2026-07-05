/* deno-lint-ignore-file no-explicit-any */
import { epochToIso, type OnchainPosition } from "./reward-pools.ts";

// Leaderboards domain helpers shared by the reward-pool ingestion hooks, the `leaderboards`
// read function, and the finalize cron. Result rows never store points; boards persist derived
// totals so read-heavy circuit pages do not aggregate on every request.

export interface ScoringProfile {
  type?: string;
  podium?: Record<string, number>;
  curve?: { kind?: string; from?: number; floor?: number; step?: number };
  participation?: number;
  review_window_hours?: number;
  min_participants?: number;
}

// Mirrors the games.scoring_profile column default; used for events without a game.
export const DEFAULT_SCORING_PROFILE: ScoringProfile = {
  type: "placement_points",
  podium: { "1": 100, "2": 80, "3": 65 },
  curve: { kind: "linear", from: 55, floor: 1 },
  participation: 5,
  review_window_hours: 72,
  min_participants: 0,
};

export interface GameResultRow {
  id: string;
  event_id: string;
  wallet_address: string;
  player_id: string | null;
  placement: number;
  result_kind: string;
  source: string;
  status: string;
}

export function resultPlayerKey(row: { player_id?: string | null; wallet_address?: string | null }): string {
  return row.player_id || String(row.wallet_address || "").toLowerCase();
}

// Maps winner wallets to Privy user ids via app_user_profiles.wallet_addresses (lowercase).
// A wallet found in more than one profile is left unresolved — never credit the wrong DID.
export async function resolvePlayerIds(
  supabase: any,
  wallets: string[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const unique = Array.from(new Set(wallets.map((w) => w.toLowerCase()))).filter(Boolean);
  if (unique.length === 0) return resolved;

  const { data, error } = await supabase
    .from("app_user_profiles")
    .select("privy_user_id, wallet_addresses")
    .overlaps("wallet_addresses", unique);
  if (error) {
    console.error("[leaderboards] player resolution failed:", error.message);
    return resolved;
  }

  const owners = new Map<string, string[]>();
  for (const profile of data ?? []) {
    for (const w of profile.wallet_addresses ?? []) {
      const wallet = String(w).toLowerCase();
      if (!unique.includes(wallet)) continue;
      owners.set(wallet, [...(owners.get(wallet) ?? []), profile.privy_user_id]);
    }
  }
  for (const [wallet, ids] of owners) {
    if (ids.length === 1) resolved.set(wallet, ids[0]);
    else console.warn(`[leaderboards] wallet in ${ids.length} profiles, leaving unresolved: ${wallet}`);
  }
  return resolved;
}

// Mirrors a pool's assigned positions into game_results (provisional, idempotent). Callers treat
// this as a post-success side effect: it logs and swallows internally derived errors and must
// never make a pool create/sync fail.
export async function ingestRewardPoolResults(
  supabase: any,
  poolCtx: { poolDbId: string; eventLock: string; claimStart?: number; challengeWindowSecs?: number },
  positions: OnchainPosition[],
): Promise<void> {
  try {
    const relevant = positions.filter((p) => p.winner || p.reclaimed);
    if (relevant.length === 0) return;

    // ilike with no wildcards = case-insensitive equality; events.lock_address may be checksummed
    // while the on-chain read is lowercase.
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, creator_id, game_id")
      .ilike("lock_address", poolCtx.eventLock)
      .maybeSingle();
    if (eventErr) throw eventErr;
    if (!event) {
      console.log(`[leaderboards] no event for lock ${poolCtx.eventLock}; skipping ingest`);
      return;
    }

    const playerIds = await resolvePlayerIds(
      supabase,
      relevant.map((p) => p.winner).filter(Boolean) as string[],
    );

    const rows = relevant.map((p) => {
      const naturalWindow = p.assignedAt && poolCtx.challengeWindowSecs
        ? p.assignedAt + poolCtx.challengeWindowSecs
        : 0;
      const effectiveHoldUntil = Math.max(
        poolCtx.claimStart ?? 0,
        naturalWindow,
        p.holdUntil ?? 0,
      );

      return {
        idempotency_key: `rp:${poolCtx.poolDbId}:${p.placement}`,
        game_id: event.game_id ?? "",
        event_id: event.id,
        reward_pool_id: poolCtx.poolDbId,
        organizer_id: event.creator_id,
        player_id: p.winner ? (playerIds.get(p.winner) ?? "") : "",
        wallet_address: p.winner ?? "",
        placement: p.placement,
        reclaimed: p.reclaimed,
        occurred_at: epochToIso(p.assignedAt) ?? "",
        hold_until: epochToIso(effectiveHoldUntil) ?? "",
      };
    });

    const { error } = await supabase.rpc("ingest_reward_pool_results", { p_rows: rows });
    if (error) throw error;
  } catch (err: any) {
    console.error("[leaderboards] ingest failed (swallowed):", err?.message || err);
  }
}

// UX-polish mirror of the finalize cron's void rules so an upheld dispute reflects on standings
// immediately; the cron remains the correctness backstop. Logs and swallows.
export async function voidResultsForUpheldDispute(
  supabase: any,
  dispute: { reward_pool_id: string; placement: number | null; category: string },
): Promise<void> {
  try {
    const voidPatch = {
      status: "voided",
      void_reason: "dispute_upheld",
      voided_at: new Date().toISOString(),
    };

    if (dispute.category !== "standings") {
      let query = supabase
        .from("game_results")
        .update(voidPatch)
        .eq("reward_pool_id", dispute.reward_pool_id)
        .eq("source", "reward_pool")
        .eq("status", "provisional");
      if (dispute.placement != null) query = query.eq("placement", dispute.placement);
      const { error } = await query;
      if (error) throw error;
    }

    // Standings or pool-level disputes taint the organizer-extended sheet for the event.
    if (dispute.category === "standings" || dispute.placement == null) {
      const { data: pool } = await supabase
        .from("reward_pools")
        .select("event_lock_address")
        .eq("id", dispute.reward_pool_id)
        .maybeSingle();
      if (!pool) return;
      const { data: event } = await supabase
        .from("events")
        .select("id")
        .ilike("lock_address", pool.event_lock_address)
        .maybeSingle();
      if (!event) return;
      const { error } = await supabase
        .from("game_results")
        .update(voidPatch)
        .eq("event_id", event.id)
        .eq("source", "organizer")
        .eq("status", "provisional");
      if (error) throw error;
    }
  } catch (err: any) {
    console.error("[leaderboards] dispute void failed (swallowed):", err?.message || err);
  }
}

const DEFAULT_CURVE_STEP = 5;

export function pointsForPlacement(placement: number, profile: ScoringProfile): number {
  const podium = profile.podium ?? {};
  if (podium[String(placement)] != null) return Number(podium[String(placement)]);

  const podiumMax = Object.keys(podium)
    .map(Number)
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0);
  const curve = profile.curve ?? {};
  const from = Number(curve.from ?? 0);
  const floor = Number(curve.floor ?? 0);
  const step = Number(curve.step ?? DEFAULT_CURVE_STEP);
  if (placement <= podiumMax || from <= 0) return floor;
  return Math.max(floor, from - (placement - podiumMax - 1) * step);
}

export interface LeaderboardBoard {
  id: string;
  scope: string;
  game_id: string;
  organizer_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  scoring_profile: ScoringProfile | null;
}

interface BoardAggregate {
  player_key: string;
  player_id: string | null;
  wallet_address: string;
  points: number;
  events_played: number;
  wins: number;
}

const BOARD_RESULTS_PAGE = 1000;

async function loadEventDates(supabase: any, eventIds: string[]): Promise<Map<string, string | null>> {
  const dates = new Map<string, string | null>();
  const unique = Array.from(new Set(eventIds)).filter(Boolean);
  const chunkSize = 500;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("events")
      .select("id, date")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const event of data ?? []) dates.set(event.id, event.date ?? null);
  }

  return dates;
}

function isEventInBoardSeason(eventDate: string | null | undefined, board: LeaderboardBoard): boolean {
  if (!board.starts_at && !board.ends_at) return true;
  if (!eventDate) return false;

  const eventMs = new Date(eventDate).getTime();
  if (!Number.isFinite(eventMs)) return false;
  if (board.starts_at && eventMs < new Date(board.starts_at).getTime()) return false;
  if (board.ends_at && eventMs > new Date(board.ends_at).getTime()) return false;
  return true;
}

// Recomputes a board's materialized standings from final results: per event a player counts
// once with their best placement (computeStandings), then points sum across events. Persisted
// atomically via replace_board_standings. Returns the standings row count.
export async function recomputeBoard(supabase: any, board: LeaderboardBoard): Promise<number> {
  let profile = board.scoring_profile ?? null;
  if (!profile) {
    const { data: game } = await supabase
      .from("games")
      .select("scoring_profile")
      .eq("id", board.game_id)
      .maybeSingle();
    profile = (game?.scoring_profile as ScoringProfile) ?? DEFAULT_SCORING_PROFILE;
  }

  const results: (GameResultRow & { occurred_at?: string })[] = [];
  for (let offset = 0; ; offset += BOARD_RESULTS_PAGE) {
    let query = supabase
      .from("game_results")
      .select("id, event_id, wallet_address, player_id, placement, result_kind, source, status")
      .eq("game_id", board.game_id)
      .eq("status", "final")
      .order("id", { ascending: true })
      .range(offset, offset + BOARD_RESULTS_PAGE - 1);
    if (board.scope === "organizer_circuit") query = query.eq("organizer_id", board.organizer_id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
    if (!data || data.length < BOARD_RESULTS_PAGE) break;
  }

  let seasonResults = results;
  if (board.starts_at || board.ends_at) {
    const eventDates = await loadEventDates(supabase, results.map((r) => r.event_id));
    seasonResults = results.filter((r) => isEventInBoardSeason(eventDates.get(r.event_id), board));
  }

  const byEvent = new Map<string, GameResultRow[]>();
  for (const r of seasonResults) {
    byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), r]);
  }

  const aggregates = new Map<string, BoardAggregate>();
  for (const eventRows of byEvent.values()) {
    for (const entry of computeStandings(eventRows, profile)) {
      const key = resultPlayerKey(entry);
      const agg = aggregates.get(key) ?? {
        player_key: key,
        player_id: entry.player_id,
        wallet_address: entry.wallet_address,
        points: 0,
        events_played: 0,
        wins: 0,
      };
      agg.points += entry.points;
      agg.events_played += 1;
      if (entry.placement === 1) agg.wins += 1;
      agg.player_id = agg.player_id ?? entry.player_id;
      agg.wallet_address = entry.wallet_address;
      aggregates.set(key, agg);
    }
  }

  const ordered = Array.from(aggregates.values()).sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    a.events_played - b.events_played ||
    a.wallet_address.localeCompare(b.wallet_address)
  );

  // Competition ranking: equal points share a rank, the next distinct total skips past the tie.
  const rows = ordered.map((agg, i) => ({ ...agg, rank: i + 1 }));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].points === rows[i - 1].points) rows[i].rank = rows[i - 1].rank;
  }

  const { data: count, error } = await supabase.rpc("replace_board_standings", {
    p_board_id: board.id,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return Number(count ?? rows.length);
}

// Post-success side effect after an admin void/unvoid: refresh the affected game's active
// boards. Logs and swallows — the mutation already persisted and the finalize cron is the
// correctness backstop.
export async function recomputeBoardsForResultChange(
  supabase: any,
  result: { game_id?: string | null; organizer_id?: string | null; event_id?: string | null },
): Promise<number> {
  let recomputed = 0;
  try {
    let gameId = result.game_id ?? null;
    const organizerId = result.organizer_id ?? null;

    if (!gameId && result.event_id) {
      const { data: event, error } = await supabase
        .from("events")
        .select("game_id")
        .eq("id", result.event_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      gameId = event?.game_id ?? null;
    }
    if (!gameId) return 0;

    const { data: boards, error } = await supabase
      .from("leaderboard_boards")
      .select("id, scope, game_id, organizer_id, starts_at, ends_at, scoring_profile")
      .eq("is_active", true)
      .eq("game_id", gameId);
    if (error) throw new Error(error.message);

    for (const board of boards ?? []) {
      if (board.scope === "organizer_circuit" && board.organizer_id !== organizerId) continue;
      await recomputeBoard(supabase, board);
      recomputed++;
    }
  } catch (err: any) {
    console.error("[leaderboards] result-change recompute failed (swallowed):", err?.message || err);
  }
  return recomputed;
}

// Post-finalize side effect: refresh active boards, stalest first. Logs and swallows per board
// so one broken board never blocks the finalize run or its siblings.
export async function recomputeActiveBoards(supabase: any, max = 50): Promise<number> {
  const { data: boards, error } = await supabase
    .from("leaderboard_boards")
    .select("id, scope, game_id, organizer_id, starts_at, ends_at, scoring_profile")
    .eq("is_active", true)
    .order("last_recomputed_at", { ascending: true, nullsFirst: true })
    .limit(max);
  if (error) {
    console.error("[leaderboards] board list failed (swallowed):", error.message);
    return 0;
  }

  let recomputed = 0;
  for (const board of boards ?? []) {
    try {
      await recomputeBoard(supabase, board);
      recomputed++;
    } catch (err: any) {
      console.error(`[leaderboards] recompute failed for board ${board.id} (swallowed):`, err?.message || err);
    }
  }
  return recomputed;
}

export interface StandingEntry {
  wallet_address: string;
  player_id: string | null;
  placement: number | null; // null = Participated tier
  tied_rank: number | null;
  points: number;
  source: string;
  status: string;
  result_id: string;
}

// Derives an event's standings from its result rows. A player counts once per event using
// their best (lowest) placement across pools — stated in the UI rules explainer.
export function computeStandings(
  results: GameResultRow[],
  profile: ScoringProfile,
): StandingEntry[] {
  const live = results.filter((r) => r.status !== "voided");

  const byPlayer = new Map<string, GameResultRow>();
  for (const r of live.filter((r) => r.result_kind === "placement")) {
    const key = resultPlayerKey(r);
    if (!key) continue;
    const existing = byPlayer.get(key);
    if (!existing || r.placement < existing.placement) byPlayer.set(key, r);
  }

  const placed = Array.from(byPlayer.values()).sort((a, b) => a.placement - b.placement);
  const tiedRank = placed.length > 0 ? placed[placed.length - 1].placement + 1 : 1;

  const entries: StandingEntry[] = placed.map((r) => ({
    wallet_address: r.wallet_address,
    player_id: r.player_id,
    placement: r.placement,
    tied_rank: null,
    points: pointsForPlacement(r.placement, profile),
    source: r.source,
    status: r.status,
    result_id: r.id,
  }));

  for (const r of live.filter((r) => r.result_kind === "participation")) {
    if (byPlayer.has(resultPlayerKey(r))) continue;
    entries.push({
      wallet_address: r.wallet_address,
      player_id: r.player_id,
      placement: null,
      tied_rank: tiedRank,
      points: Number(profile.participation ?? 0),
      source: r.source,
      status: r.status,
      result_id: r.id,
    });
  }

  return entries;
}
