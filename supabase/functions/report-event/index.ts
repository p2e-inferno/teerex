/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";

const REASONS = ["spam", "scam", "inappropriate", "misleading", "impersonation", "other"];
const RESOLVE_STATUSES = ["reviewing", "resolved", "dismissed"];
const DETAILS_MAX = 2000;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleSubmit(supabase: any, req: Request, body: any) {
  const authHeader = req.headers.get("X-Privy-Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "missing_privy_token" }, 401);
  const reporterId = await verifyPrivyToken(authHeader);

  const eventId = String(body.event_id || "").trim();
  const reason = String(body.reason || "").trim();
  const details = body.details == null ? null : String(body.details).trim().slice(0, DETAILS_MAX) || null;
  if (!eventId) return json({ ok: false, error: "event_id_required" }, 400);
  if (!REASONS.includes(reason)) return json({ ok: false, error: "invalid_reason" }, 400);

  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr) return json({ ok: false, error: evErr.message }, 400);
  if (!event) return json({ ok: false, error: "event_not_found" }, 404);

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("primary_wallet_address")
    .eq("privy_user_id", reporterId)
    .maybeSingle();

  const { error } = await supabase.from("event_reports").insert({
    event_id: eventId,
    reporter_id: reporterId,
    reporter_wallet: profile?.primary_wallet_address ?? null,
    reason,
    details,
  });
  if (error) {
    // Partial unique index (one open report per reporter per event) surfaces as 23505.
    if (String(error.code) === "23505") return json({ ok: false, error: "already_reported" }, 409);
    return json({ ok: false, error: error.message }, 400);
  }

  return json({ ok: true }, 200);
}

async function handleAdminList(supabase: any, req: Request, body: any) {
  const status = String(body.status || "").trim();
  let query = supabase
    .from("event_reports")
    .select("*, event:events(id, title, image_url, creator_id, creator_address, is_public)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, reports: data ?? [] }, 200);
}

async function handleAdminResolve(supabase: any, adminId: string, body: any) {
  const reportId = String(body.report_id || "").trim();
  const status = String(body.status || "").trim();
  const resolutionNote = body.resolution_note == null ? null : String(body.resolution_note).trim() || null;
  if (!reportId) return json({ ok: false, error: "report_id_required" }, 400);
  if (!RESOLVE_STATUSES.includes(status)) return json({ ok: false, error: "invalid_status" }, 400);

  const closing = status === "resolved" || status === "dismissed";
  const { data, error } = await supabase
    .from("event_reports")
    .update({
      status,
      resolution_note: resolutionNote,
      resolved_by: closing ? adminId : null,
      resolved_at: closing ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .select("*")
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);
  if (!data) return json({ ok: false, error: "report_not_found" }, 404);

  return json({ ok: true, report: data }, 200);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const route = String(body.route || "").trim();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (route === "submit") return await handleSubmit(supabase, req, body);

    if (route === "admin-list" || route === "admin-resolve") {
      let adminId: string;
      try {
        adminId = await ensureAdmin(req.headers);
      } catch (e: any) {
        return json({ ok: false, error: e?.message || "unauthorized" }, 403);
      }
      if (route === "admin-list") return await handleAdminList(supabase, req, body);
      return await handleAdminResolve(supabase, adminId, body);
    }

    return json({ ok: false, error: `Unknown route: ${route || "(missing)"}` }, 400);
  } catch (err: any) {
    console.error("[report-event]", err);
    const status = Number(err?.status) || 500;
    return json({ ok: false, error: err?.message || "Internal error" }, status);
  }
});
