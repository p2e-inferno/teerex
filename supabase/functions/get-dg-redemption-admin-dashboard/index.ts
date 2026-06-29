/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getPaystackBalances } from "../_shared/paystack.ts";
import { getNgnBalanceKobo, loadDgRedemptionConfig } from "../_shared/dg-redemption.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function summarize(rows: any[]) {
  const byStatus: Record<string, number> = {};
  let grossKobo = 0;
  let netPayoutKobo = 0;
  let feesKobo = 0;
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    grossKobo += Number(row.gross_ngn_kobo || 0);
    netPayoutKobo += Number(row.net_payout_kobo || 0);
    feesKobo += Number(row.total_fee_kobo || 0);
  }
  return { count: rows.length, by_status: byStatus, gross_kobo: grossKobo, net_payout_kobo: netPayoutKobo, fees_kobo: feesKobo };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
    await ensureAdmin(req.headers);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [config, recentResult, dailyResult, balancesResult] = await Promise.all([
      loadDgRedemptionConfig(supabase),
      supabase
        .from("dg_redemption_intents")
        .select("id,user_id,wallet_address,chain_id,status,amount_dg_raw,gross_ngn_kobo,service_fee_kobo,vat_kobo,total_fee_kobo,net_payout_kobo,tx_hash,paystack_reference,paystack_status,paystack_transfer_code,paystack_transfer_id,last_error,expires_at,created_at,updated_at,completed_at,payout_account:user_payout_accounts(id,account_holder_name,bank_name,account_number_last4,status)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("dg_redemption_intents")
        .select("status,gross_ngn_kobo,total_fee_kobo,net_payout_kobo")
        .gte("created_at", since24h),
      getPaystackBalances().then((balances) => ({ balances, error: null })).catch((error) => ({ balances: [], error })),
    ]);

    if (recentResult.error) throw new Error(recentResult.error.message);
    if (dailyResult.error) throw new Error(dailyResult.error.message);

    const balances = balancesResult.balances as Array<{ currency: string; balance: number }>;
    return json({
      ok: true,
      config,
      provider_health: {
        paystack_balance_kobo: getNgnBalanceKobo(balances),
        balances,
        error: balancesResult.error instanceof Error ? balancesResult.error.message : null,
      },
      summary_24h: summarize(dailyResult.data || []),
      recent_redemptions: recentResult.data || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = message.includes("unauthorized") ? 403 : message.includes("authorization") ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});
