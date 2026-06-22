/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { decryptAccountNumber, publicPayoutAccount } from "../_shared/dg-redemption.ts";

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("user_payout_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "paystack")
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return json({ ok: false, error: "Save your bank account before redeeming DG" }, 404);
    }

    const accountNumber = await decryptAccountNumber(data.encrypted_account_number);
    await supabase
      .from("user_payout_accounts")
      .update({ revealed_at: new Date().toISOString() })
      .eq("id", data.id);
    await supabase.from("dg_redemption_events").insert({
      event_type: "payout_account_revealed",
      actor_user_id: userId,
      metadata: {
        payout_account_id: data.id,
        bank_code: data.bank_code,
        account_number_last4: data.account_number_last4,
      },
    });

    return json({
      ok: true,
      payout_account: {
        ...publicPayoutAccount(data, false),
        account_number: accountNumber,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token") ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});
