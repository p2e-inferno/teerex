/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

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
    const toBool = (v: unknown) => v === true || v === "true";

    const mine = toBool(body.mine ?? url.searchParams.get("mine"));
    const chainId = body.chain_id ?? url.searchParams.get("chain_id");
    const hasNativeGas = toBool(body.has_native_gas ?? url.searchParams.get("has_native_gas"));
    const status = body.status ?? url.searchParams.get("status");
    const targetEvent = (body.target_event_address ?? url.searchParams.get("target_event_address")) as string | null;
    const search = (body.q ?? url.searchParams.get("q")) as string | null;
    const limit = Math.min(Number((body.limit ?? url.searchParams.get("limit")) || 50), 200);
    const offset = Math.max(Number((body.offset ?? url.searchParams.get("offset")) || 0), 0);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = supabase
      .from("ticket_passes")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (mine) {
      const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
      query = query.eq("creator_id", privyUserId);
    } else {
      // Public marketplace: active, closed and sold-out are all visible.
      if (status) query = query.eq("status", String(status).toUpperCase());
    }

    if (chainId) query = query.eq("chain_id", Number(chainId));
    if (hasNativeGas) query = query.neq("eth_per_copy_wei", "0");
    if (targetEvent) query = query.eq("target_event_address", String(targetEvent).toLowerCase());
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, passes: data ?? [] }, 200);
  } catch (err: any) {
    console.error("[list-ticket-passes]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
