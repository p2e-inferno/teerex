/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { validateUserWallet, verifyPrivyToken } from "../_shared/privy.ts";

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
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const walletAddress = await validateUserWallet(userId, body.wallet_address, "wallet_not_authorized_for_user");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.rpc("get_my_purchase_form_prefill", {
      p_owner_wallet: walletAddress,
    });

    if (error) throw new Error(error.message);

    return json({ ok: true, prefill: data ?? {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = message.includes("authorization") ||
      message.includes("Token") ||
      message.includes("authorized") ||
      message.includes("wallet")
      ? 401
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
