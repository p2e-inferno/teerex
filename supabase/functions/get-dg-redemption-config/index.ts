/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getActiveNetworks } from "../_shared/network-helpers.ts";
import { getDgRedemptionDiagnostics, loadDgRedemptionConfig } from "../_shared/dg-redemption.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
    const adminUserId = await ensureAdmin(req.headers);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [config, networks] = await Promise.all([
      loadDgRedemptionConfig(supabase),
      getActiveNetworks(supabase),
    ]);
    const diagnostics = await getDgRedemptionDiagnostics({ config, networks });
    return json({ ok: true, admin_user_id: adminUserId, config, networks, diagnostics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = message.includes("unauthorized") ? 403 : message.includes("authorization") ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});
