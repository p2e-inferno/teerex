/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { resolveLinkableEventByAddress } from "../_shared/linkable-events.ts";

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
    if (req.method !== "POST" && req.method !== "PATCH") return json({ ok: false, error: "Method not allowed" }, 405);

    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const passId = String(body.pass_id || body.id || "").trim();
    if (!passId) return json({ ok: false, error: "pass_id_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pass } = await supabase
      .from("ticket_passes")
      .select("id, creator_id, chain_id")
      .eq("id", passId)
      .maybeSingle();

    if (!pass) return json({ ok: false, error: "pass_not_found" }, 404);
    if (pass.creator_id !== privyUserId) return json({ ok: false, error: "forbidden" }, 403);

    // Only non-financial fields are editable; payout terms are immutable on-chain.
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.description !== undefined) updates.description = String(body.description).trim();
    if (body.image_url !== undefined) updates.image_url = body.image_url ? String(body.image_url).trim() : null;
    if (body.metadata_set !== undefined) updates.metadata_set = Boolean(body.metadata_set);
    if (body.target_event_address !== undefined) {
      const t = body.target_event_address ? String(body.target_event_address).trim().toLowerCase() : null;
      if (t && !isAddr(t)) return json({ ok: false, error: "invalid_target_event_address" }, 400);
      if (t) {
        const targetEvent = await resolveLinkableEventByAddress(supabase, t, { chainId: Number(pass.chain_id) });
        if (!targetEvent.ok) return json({ ok: false, error: targetEvent.error }, 400);
      }
      updates.target_event_address = t;
    }

    if (Object.keys(updates).length === 0) return json({ ok: false, error: "no_updatable_fields" }, 400);

    const { data, error } = await supabase
      .from("ticket_passes")
      .update(updates)
      .eq("id", passId)
      .select("*")
      .single();

    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true, pass: data }, 200);
  } catch (err: any) {
    console.error("[update-ticket-pass]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
