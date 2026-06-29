/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import TicketPassControllerAbi from "../_shared/abi/TeeRexTicketPassControllerV1.json" assert { type: "json" };

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
    const privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const passId = String(body.pass_id || body.id || "").trim();
    if (!passId) return json({ ok: false, error: "pass_id_required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pass } = await supabase
      .from("ticket_passes")
      .select("id, creator_id, chain_id, lock_address, controller_address, status")
      .eq("id", passId)
      .maybeSingle();

    if (!pass) return json({ ok: false, error: "pass_not_found" }, 404);
    if (pass.creator_id !== privyUserId) return json({ ok: false, error: "forbidden" }, 403);

    const networkConfig = await validateChain(supabase, Number(pass.chain_id));
    if (!networkConfig?.rpc_url) return json({ ok: false, error: "rpc_not_configured" }, 400);

    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const controller = new ethers.Contract(pass.controller_address, TicketPassControllerAbi as any, provider);
    const cfg = await controller.passByLock(pass.lock_address);
    if (!cfg.exists) return json({ ok: false, error: "pass_not_found_on_chain" }, 400);

    const remaining: bigint = await controller.remainingCopies(pass.lock_address).catch(() => 0n);

    let status = "ACTIVE";
    if (cfg.closed) status = "CLOSED";
    else if (remaining <= 0n) status = "SOLD_OUT";

    const { data, error } = await supabase
      .from("ticket_passes")
      .update({ status, issuance_enabled: Boolean(cfg.issuanceEnabled) })
      .eq("id", passId)
      .select("*")
      .single();

    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true, pass: data, on_chain: { closed: cfg.closed, issuance_enabled: cfg.issuanceEnabled, remaining: remaining.toString() } }, 200);
  } catch (err: any) {
    console.error("[sync-ticket-pass-status]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
