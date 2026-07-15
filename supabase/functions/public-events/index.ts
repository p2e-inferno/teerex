/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import {
  applyPublicEventSort,
  loadPublicEventStats,
  PUBLIC_EVENT_SELECT,
} from "../_shared/public-events.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const toBool = (value: unknown) => value === true || value === "true";

function cleanSearch(value: unknown): string {
  return String(value || "").replace(/[,().%]/g, " ").trim().slice(0, 120);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 100);
    const offset = Math.max(Number(body.offset) || 0, 0);
    const sort = String(body.sort || "date-desc");
    const upcomingOnly = toBool(body.upcoming_only);
    const includeStats = toBool(body.include_stats);
    const search = cleanSearch(body.query);
    const category = String(body.category || "").trim().slice(0, 80);
    const eventIds = Array.isArray(body.event_ids)
      ? body.event_ids.map((value: unknown) => String(value)).filter(Boolean).slice(0, 100)
      : [];
    const now = new Date();
    const nowIso = now.toISOString();
    const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let query = supabase
      .from("events")
      .select(PUBLIC_EVENT_SELECT, { count: "exact" })
      .eq("is_public", true);

    if (eventIds.length > 0) query = query.in("id", eventIds);
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`title.ilike.${pattern},description.ilike.${pattern},location.ilike.${pattern},category.ilike.${pattern}`);
    }
    if (category) query = query.eq("category", category);
    if (toBool(body.has_image)) query = query.not("image_url", "is", null).neq("image_url", "");
    if (body.is_free === true) query = query.contains("payment_methods", ["free"]);
    if (body.is_free === false) query = query.not("payment_methods", "cs", "{free}");
    if (body.date_from) query = query.gte("date", String(body.date_from));
    if (body.date_to) query = query.lte("date", String(body.date_to));
    if (upcomingOnly) {
      query = query.or(`starts_at.gte.${nowIso},and(starts_at.is.null,date.gte.${todayIso})`);
    }

    query = applyPublicEventSort(query, sort).order("id", { ascending: true });

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return json({ ok: false, error: error.message }, 400);

    const events = data ?? [];
    const totalCount = count ?? events.length;
    const stats = includeStats ? await loadPublicEventStats(supabase) : undefined;
    return json({
      ok: true,
      events,
      total_count: totalCount,
      has_more: offset + events.length < totalCount,
      ...(stats ? { stats } : {}),
    });
  } catch (err: any) {
    console.error("[public-events]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 500);
  }
});
