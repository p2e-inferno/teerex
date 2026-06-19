/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddr = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const id = String(body.id || body.pass_id || url.searchParams.get("id") || "").trim();
    const lockAddress = String(body.lock_address || url.searchParams.get("lock_address") || "").trim().toLowerCase();

    if (!id && !lockAddress) return json({ ok: false, error: "id_or_lock_address_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let query = supabase.from("ticket_passes").select("*");
    query = lockAddress && isAddr(lockAddress) ? query.eq("lock_address", lockAddress) : query.eq("id", id);

    const { data, error } = await query.maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: "pass_not_found" }, 404);

    return json({ ok: true, pass: data }, 200);
  } catch (err: any) {
    console.error("[get-ticket-pass]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
