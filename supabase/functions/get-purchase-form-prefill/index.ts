/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { validateUserWallet, verifyPrivyToken } from "../_shared/privy.ts";
import { getPublishedPurchaseFormSchema } from "../_shared/purchase-form.ts";

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

    const body = await req.json().catch(() => ({}));
    const rawWalletAddress = typeof body.wallet_address === "string" ? body.wallet_address : "";
    const eventId = typeof body.event_id === "string" && body.event_id.trim() ? body.event_id.trim() : null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const schemaPromise = getPublishedPurchaseFormSchema(supabase, eventId);

    let walletAddress: string | null = null;
    if (rawWalletAddress) {
      try {
        const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
        walletAddress = await validateUserWallet(userId, rawWalletAddress, "wallet_not_authorized_for_user");
      } catch (authErr) {
        // Best-effort prefill: degrade to schema-only, but log so a Privy outage or
        // misconfig is visible instead of looking identical to an unauthed caller.
        console.warn(
          "[get-purchase-form-prefill] wallet prefill skipped:",
          authErr instanceof Error ? authErr.message : String(authErr),
        );
        walletAddress = null;
      }
    }

    const [schemaResult, prefillResult, emailResult] = await Promise.all([
      schemaPromise,
      walletAddress
        ? supabase.rpc("get_my_purchase_form_prefill", { p_owner_wallet: walletAddress })
        : Promise.resolve({ data: {}, error: null }),
      walletAddress
        ? supabase.rpc("get_my_ticket_email", { p_owner_wallet: walletAddress })
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (prefillResult.error) throw new Error(prefillResult.error.message);
    if (emailResult.error) throw new Error(emailResult.error.message);

    return json({
      ok: true,
      prefill: prefillResult.data ?? {},
      email: emailResult.data ?? null,
      prefill_source: walletAddress,
      purchase_form_schema: schemaResult.schema,
    });
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
