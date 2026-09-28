/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { loadDisplayNames } from "../_shared/profiles.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normalizeAddress = (value: unknown) => String(value || "").trim().toLowerCase();

function publicRow(row: any, displayName: string | null = null) {
  return {
    id: row.id,
    creator_address: row.creator_address,
    creator_display_name: displayName,
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    chain_id: Number(row.chain_id),
    currency: row.currency,
    price: Number(row.price),
    max_supply: Number(row.max_supply),
    max_keys_per_address: Number(row.max_keys_per_address || 1),
    lock_address: row.lock_address,
    transaction_hash: row.transaction_hash,
    is_claimable: Boolean(row.is_claimable),
    fulfillment_note: row.fulfillment_note,
    is_public: Boolean(row.is_public),
    transferable: Boolean(row.transferable),
    nft_metadata_set: Boolean(row.nft_metadata_set),
    nft_base_uri: row.nft_base_uri,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function withDisplayNames(supabase: any, rows: any[]) {
  const names = await loadDisplayNames(supabase, rows.map((row) => row.creator_id));
  return rows.map((row) => publicRow(row, names.get(row.creator_id) ?? null));
}

async function handleList(supabase: any, body: any) {
  const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 48);
  const offset = Math.max(Number(body.offset) || 0, 0);
  const creatorAddress = normalizeAddress(body.creator_address);
  const search = String(body.query || "").trim().slice(0, 120);

  let query = supabase
    .from("collectibles")
    .select("*", { count: "exact" })
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (creatorAddress) {
    if (!isAddress(creatorAddress)) return json({ ok: false, error: "Invalid creator address." }, 400);
    query = query.ilike("creator_address", creatorAddress);
  }

  // Keep V1 search deliberately simple and safe: creator listing names only.
  if (search) query = query.ilike("name", `%${search.replace(/[%_]/g, "")}%`);

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return json({ ok: false, error: error.message }, 400);

  const rows = data ?? [];
  const totalCount = count ?? rows.length;
  return json({
    ok: true,
    collectibles: await withDisplayNames(supabase, rows),
    total_count: totalCount,
    has_more: offset + rows.length < totalCount,
  });
}

async function handleDetail(supabase: any, body: any) {
  const id = String(body.id || "").trim();
  if (!id) return json({ ok: false, error: "Collectible id is required." }, 400);
  if (!isAddress(id) && !isUuid(id)) {
    return json({ ok: false, error: "Invalid collectible identifier." }, 400);
  }

  let query = supabase.from("collectibles").select("*").eq("is_public", true);
  query = isAddress(id) ? query.ilike("lock_address", id.toLowerCase()) : query.eq("id", id);
  const { data, error } = await query.maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);
  if (!data) return json({ ok: false, error: "Collectible not found." }, 404);

  const [mapped] = await withDisplayNames(supabase, [data]);
  return json({ ok: true, collectible: mapped });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    switch (String(body.route || "list")) {
      case "list": return await handleList(supabase, body);
      case "detail": return await handleDetail(supabase, body);
      default: return json({ ok: false, error: "Unknown collectibles route." }, 400);
    }
  } catch (error: any) {
    console.error("[collectibles]", error);
    return json({ ok: false, error: error?.message || "Internal error." }, 500);
  }
});
