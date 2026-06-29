/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getActor(req: Request): Promise<string> {
  const secret = Deno.env.get("DG_REDEMPTION_CRON_SECRET");
  const authorization = req.headers.get("Authorization") || "";
  if (secret && authorization === `Bearer ${secret}`) return "system";
  return await ensureAdmin(req.headers);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const actorUserId = await getActor(req);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: awaitingRows, error: awaitingError } = await supabase
      .from("dg_redemption_intents")
      .update({
        status: "expired",
        lock_id: null,
        locked_at: null,
        last_error: "quote_expired",
      })
      .eq("status", "awaiting_transfer")
      .lt("expires_at", now)
      .select("id,user_id,wallet_address,expires_at,status");
    if (awaitingError) throw new Error(awaitingError.message);

    const { data: staleValidationRows, error: staleValidationError } = await supabase
      .from("dg_redemption_intents")
      .update({
        status: "expired",
        lock_id: null,
        locked_at: null,
        last_error: "quote_expired",
      })
      .eq("status", "validating_transfer")
      .lt("expires_at", now)
      .or(`lock_id.is.null,locked_at.lt.${staleBefore}`)
      .select("id,user_id,wallet_address,expires_at,status");
    if (staleValidationError) throw new Error(staleValidationError.message);

    const expiredRows = [...(awaitingRows || []), ...(staleValidationRows || [])];
    if (expiredRows.length) {
      await supabase.from("dg_redemption_events").insert(expiredRows.map((row: any) => ({
        intent_id: row.id,
        event_type: "quote_expired",
        actor_user_id: actorUserId,
        actor_wallet_address: row.wallet_address,
        metadata: {
          expires_at: row.expires_at,
          expired_by: actorUserId === "system" ? "cron" : "admin",
        },
      })));
    }

    return json({ ok: true, expired_count: expiredRows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("unauthorized")
      ? 403
      : lower.includes("authorization")
      ? 401
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
