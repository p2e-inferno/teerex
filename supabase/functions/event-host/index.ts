/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { resolveDisplayName } from "../_shared/profiles.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: unknown) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);
const RECENT_HOLDER_LIMIT = 8;
const PUBLIC_EVENT_SELECT = [
  "id",
  "title",
  "description",
  "date",
  "end_date",
  "starts_at",
  "ends_at",
  "registration_cutoff",
  "time",
  "location",
  "event_type",
  "capacity",
  "price",
  "currency",
  "ngn_price",
  "ngn_price_kobo",
  "payment_methods",
  "category",
  "image_url",
  "image_crop_x",
  "image_crop_y",
  "lock_address",
  "transaction_hash",
  "chain_id",
  "created_at",
  "updated_at",
  "attestation_enabled",
  "attendance_schema_uid",
  "review_schema_uid",
  "max_keys_per_address",
  "transferable",
  "requires_approval",
  "service_manager_added",
  "is_public",
  "allow_waitlist",
  "has_allow_list",
  "nft_metadata_set",
  "nft_base_uri",
  "refund_protection_enabled",
  "refund_min_attendees",
  "refund_trigger_at",
  "refund_event_end_at",
  "refund_controller_address",
  "refund_reserve_bond",
  "refund_status",
  "refund_manager_released",
  "refund_manager_released_at",
  "refund_last_tx_hash",
  "refund_last_synced_at",
  "game_id",
  "creator_address",
].join(", ");

async function countPublicEventsByCreator(supabase: any, creatorId: string): Promise<number> {
  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .eq("is_public", true);
  return count ?? 0;
}

async function attachActiveTicketCounts(supabase: any, events: any[]): Promise<{ events: any[]; error: any | null }> {
  const eventIds = Array.from(new Set((events ?? []).map((event) => String(event.id || "")).filter(Boolean)));
  if (eventIds.length === 0) return { events: events ?? [], error: null };

  const { data, error } = await supabase
    .from("tickets")
    .select("event_id")
    .in("event_id", eventIds)
    .eq("status", "active");
  if (error) return { events, error };

  const counts = new Map<string, number>(eventIds.map((id) => [id, 0]));
  for (const ticket of data ?? []) {
    const eventId = String(ticket.event_id || "");
    if (eventId) counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
  }

  return {
    events: (events ?? []).map((event) => ({
      ...event,
      keys_sold: counts.get(String(event.id)) ?? 0,
    })),
    error: null,
  };
}

// Best-effort resolution of holder wallets to public display names via their primary wallet.
async function loadNamesByWallet(supabase: any, wallets: string[]): Promise<Map<string, string>> {
  const byWallet = new Map<string, string>();
  const unique = Array.from(new Set(wallets)).filter(Boolean);
  if (unique.length === 0) return byWallet;
  const { data } = await supabase
    .from("app_user_profiles")
    .select("primary_wallet_address, display_name")
    .in("primary_wallet_address", unique)
    .not("display_name", "is", null);
  for (const p of data ?? []) {
    if (p.primary_wallet_address) byWallet.set(String(p.primary_wallet_address).toLowerCase(), p.display_name);
  }
  return byWallet;
}

async function handleSummary(supabase: any, body: any) {
  const eventId = String(body.event_id || "").trim();
  if (!eventId) return json({ ok: false, error: "event_id_required" }, 400);

  const { data: event, error } = await supabase
    .from("events")
    .select("id, creator_id, creator_address")
    .eq("id", eventId)
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);
  if (!event) return json({ ok: false, error: "event_not_found" }, 404);

  const [displayName, hostedCount, { data: tickets, error: ticketsErr }] = await Promise.all([
    resolveDisplayName(supabase, event.creator_id),
    countPublicEventsByCreator(supabase, event.creator_id),
    supabase
      .from("tickets")
      .select("owner_wallet, granted_at, created_at")
      .eq("event_id", eventId)
      .eq("status", "active"),
  ]);
  if (ticketsErr) return json({ ok: false, error: ticketsErr.message }, 400);

  // Distinct holders, keyed by wallet, tracking the most recent grant for ordering.
  const latestByWallet = new Map<string, string | null>();
  for (const t of tickets ?? []) {
    const wallet = String(t.owner_wallet || "").toLowerCase();
    if (!wallet) continue;
    const ts = t.granted_at ?? t.created_at ?? null;
    const prev = latestByWallet.get(wallet);
    if (prev === undefined || (ts && (!prev || ts > prev))) latestByWallet.set(wallet, ts);
  }

  const ordered = Array.from(latestByWallet, ([wallet, ts]) => ({ wallet, ts }))
    .sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))
    .slice(0, RECENT_HOLDER_LIMIT);

  const names = await loadNamesByWallet(supabase, ordered.map((h) => h.wallet));
  const recentHolders = ordered.map((h) => ({ wallet: h.wallet, display_name: names.get(h.wallet) ?? null }));

  return json({
    ok: true,
    host: {
      display_name: displayName,
      creator_address: event.creator_address ?? null,
      hosted_public_count: hostedCount,
    },
    social: {
      ticket_holder_count: latestByWallet.size,
      recent_holders: recentHolders,
    },
  }, 200);
}

async function handleOtherEvents(supabase: any, body: any) {
  const eventId = String(body.event_id || "").trim();
  if (!eventId) return json({ ok: false, error: "event_id_required" }, 400);
  const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 12);
  const offset = Math.max(Number(body.offset) || 0, 0);

  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("creator_id")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr) return json({ ok: false, error: evErr.message }, 400);
  if (!event) return json({ ok: false, error: "event_not_found" }, 404);

  const { data: events, error, count } = await supabase
    .from("events")
    .select(PUBLIC_EVENT_SELECT, { count: "exact" })
    .eq("creator_id", event.creator_id)
    .eq("is_public", true)
    .neq("id", eventId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return json({ ok: false, error: error.message }, 400);

  const totalCount = count ?? (events?.length || 0);
  const counted = await attachActiveTicketCounts(supabase, events ?? []);
  if (counted.error) return json({ ok: false, error: counted.error.message }, 400);

  return json({
    ok: true,
    events: counted.events,
    total_count: totalCount,
    has_more: offset + (events?.length || 0) < totalCount,
  }, 200);
}

async function handleProfile(supabase: any, body: any) {
  const address = String(body.address || "").trim().toLowerCase();
  if (!isAddr(address)) return json({ ok: false, error: "valid_address_required" }, 400);

  // Resolve the creator identity from any event deployed by this wallet.
  const { data: anyEvent } = await supabase
    .from("events")
    .select("creator_id")
    .ilike("creator_address", address)
    .limit(1)
    .maybeSingle();
  if (!anyEvent?.creator_id) return json({ ok: false, error: "host_not_found" }, 404);

  const creatorId = anyEvent.creator_id;
  const [displayName, hostedCount, { data: events, error }] = await Promise.all([
    resolveDisplayName(supabase, creatorId),
    countPublicEventsByCreator(supabase, creatorId),
      supabase
        .from("events")
        .select(PUBLIC_EVENT_SELECT)
      .eq("creator_id", creatorId)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  if (error) return json({ ok: false, error: error.message }, 400);

  const counted = await attachActiveTicketCounts(supabase, events ?? []);
  if (counted.error) return json({ ok: false, error: counted.error.message }, 400);

  return json({
    ok: true,
    host: {
      display_name: displayName,
      creator_address: address,
      hosted_public_count: hostedCount,
    },
    events: counted.events,
  }, 200);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const route = String(body.route || "").trim();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Public reads: host attribution, ticket-holder social proof, and public event discovery.
    switch (route) {
      case "summary":
        return await handleSummary(supabase, body);
      case "other-events":
        return await handleOtherEvents(supabase, body);
      case "profile":
        return await handleProfile(supabase, body);
      default:
        return json({ ok: false, error: `Unknown route: ${route || "(missing)"}` }, 400);
    }
  } catch (err: any) {
    console.error("[event-host]", err);
    const status = Number(err?.status) || 500;
    return json({ ok: false, error: err?.message || "Internal error" }, status);
  }
});
