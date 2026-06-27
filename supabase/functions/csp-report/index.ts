import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { buildPreflightHeaders, corsHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import {
  normalizeCspReports,
  RATE_LIMIT,
  readJsonWithLimit,
  resolveClientIp,
} from "./report.ts";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleCspReport(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Allow": "POST",
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const ip = resolveClientIp(req);
  const rateLimitKey = ip ?? "unknown";

  const { data: rateAllowed, error: rateError } = await supabase.rpc(
    "check_and_increment_csp_rate_limit",
    {
      p_ip: rateLimitKey,
      p_window_seconds: RATE_LIMIT.windowSeconds,
      p_max: RATE_LIMIT.max,
    },
  );

  if (rateError) {
    console.error("[csp-report] rate limit check failed", { error: rateError, ip: rateLimitKey });
    return jsonResponse({ ok: false, error: "Rate limit check failed" }, 500);
  }

  if (rateAllowed !== true) {
    return jsonResponse({ ok: false, error: "Too many reports" }, 429);
  }

  const parsed = await readJsonWithLimit(req);
  if (!parsed.ok) {
    if (parsed.reason === "too_large") {
      return jsonResponse({ ok: false, error: "Report body is too large" }, 413);
    }
    return jsonResponse({ ok: false, error: "Invalid CSP report" }, 400);
  }

  const reports = normalizeCspReports(parsed.value);
  if (reports.length === 0) {
    return jsonResponse({ ok: false, error: "Incomplete CSP report" }, 400);
  }

  const receivedAt = new Date().toISOString();
  const userAgent = req.headers.get("user-agent");
  const rows = reports.map((report) => ({
    received_at: receivedAt,
    ip,
    user_agent: userAgent,
    document_uri: report.documentUri,
    violated_directive: report.violatedDirective,
    blocked_uri: report.blockedUri,
    source_file: report.sourceFile,
    line_number: report.lineNumber,
    column_number: report.columnNumber,
    status_code: report.statusCode,
    raw_report: report.raw,
  }));

  const { error: insertError } = await supabase
    .from("csp_reports")
    .insert(rows);

  if (insertError) {
    console.error("[csp-report] failed to persist report", { error: insertError });
    return jsonResponse({ ok: false, error: "Failed to store CSP report" }, 500);
  }

  return jsonResponse({ ok: true, status: "accepted", count: rows.length });
}

serve(handleCspReport);
