/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getActiveNetworks } from "../_shared/network-helpers.ts";
import {
  saveDgRedemptionConfig,
  validateDgRedemptionConfigForSave,
} from "../_shared/dg-redemption.ts";

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
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const adminUserId = await ensureAdmin(req.headers);
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const networks = await getActiveNetworks(supabase);
    const config = validateDgRedemptionConfigForSave(body.config ?? body, networks);
    const saved = await saveDgRedemptionConfig(supabase, config);
    await supabase.from("dg_redemption_events").insert({
      event_type: "admin_config_updated",
      actor_user_id: adminUserId,
      metadata: { config: saved },
    });

    return json({ ok: true, config: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("unauthorized")
      ? 403
      : lower.includes("authorization")
      ? 401
      : lower.includes("required") || lower.includes("maximum") || lower.includes("minimum") || lower.includes("must be") || lower.includes("not an active")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
