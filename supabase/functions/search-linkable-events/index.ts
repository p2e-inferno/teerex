/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { isEventLockAddress, LINKABLE_EVENT_FIELDS } from "../_shared/linkable-events.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const search = String(body.q ?? url.searchParams.get("q") ?? "").trim();
    const chainId = body.chain_id ?? url.searchParams.get("chain_id");
    const limit = Math.min(Math.max(Number(body.limit ?? url.searchParams.get("limit") ?? 20), 1), 50);
    const offset = Math.max(Number(body.offset ?? url.searchParams.get("offset") ?? 0), 0);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase
      .from("events")
      .select(LINKABLE_EVENT_FIELDS, { count: "exact" })
      .eq("is_public", true)
      .neq("lock_address", "Unknown");

    if (chainId !== null && chainId !== undefined && String(chainId).trim() !== "") {
      const parsedChainId = Number(chainId);
      if (!Number.isFinite(parsedChainId)) return json({ ok: false, error: "Invalid chain_id" }, 400);
      query = query.eq("chain_id", parsedChainId);
    }

    if (search) {
      if (isEventLockAddress(search)) {
        query = query.ilike("lock_address", search.toLowerCase());
      } else {
        query = query.ilike("title", `%${search}%`);
      }
    }

    const { data, error, count } = await query
      .order("date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return json({ ok: false, error: error.message }, 400);

    const events = data ?? [];
    const totalCount = count ?? events.length;
    return json({
      ok: true,
      events,
      total_count: totalCount,
      has_more: offset + events.length < totalCount,
    });
  } catch (err: any) {
    console.error("[search-linkable-events]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
