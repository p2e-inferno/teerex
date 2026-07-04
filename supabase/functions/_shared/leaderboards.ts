/* deno-lint-ignore-file no-explicit-any */
import { epochToIso, type OnchainPosition } from "./reward-pools.ts";

// Leaderboards domain helpers shared by the reward-pool ingestion hooks, the `leaderboards`
// read function, and the finalize cron. Points are always derived from a game's scoring_profile
// at read time — never persisted — so formula changes take effect without rewriting history.

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

  const byWallet = new Map<string, GameResultRow>();
  for (const r of live.filter((r) => r.result_kind === "placement")) {
    const existing = byWallet.get(r.wallet_address);
    if (!existing || r.placement < existing.placement) byWallet.set(r.wallet_address, r);
  }

  const placed = Array.from(byWallet.values()).sort((a, b) => a.placement - b.placement);
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
    if (byWallet.has(r.wallet_address)) continue;
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
