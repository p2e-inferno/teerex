import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { enforcePost } from "../_shared/http.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { handleError } from "../_shared/error-handler.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });
  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;
  try {
    privyUserId = await ensureAdmin(req.headers);

    const body = await req.json().catch(() => ({}));
    const limit = typeof body?.limit === "number" && body.limit > 0 ? Math.min(body.limit, 200) : 50;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: gasRows } = await supabase
      .from("gas_transactions")
      .select("transaction_hash, chain_id, gas_cost_eth, gas_used, gas_price, event_id, payment_transaction_id, created_at, status")
      .order("created_at", { ascending: false })
      .limit(limit);

    const totalsByChain: Record<string, { gas_cost_eth: number; count: number }> = {};
    for (const row of gasRows || []) {
      const key = String(row.chain_id);
      if (!totalsByChain[key]) {
        totalsByChain[key] = { gas_cost_eth: 0, count: 0 };
      }
      totalsByChain[key].gas_cost_eth += Number(row.gas_cost_eth || 0);
      totalsByChain[key].count += 1;
    }

    const totals = Object.entries(totalsByChain).map(([chainId, agg]) => ({
      chain_id: Number(chainId),
      gas_cost_eth: agg.gas_cost_eth,
      count: agg.count,
    }));

    const { data: activity } = await supabase
      .from("gasless_activity_log")
      .select("id, user_id, activity, chain_id, event_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    return new Response(
      JSON.stringify({
        ok: true,
        totals,
        recent: gasRows || [],
        activity: activity || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    return handleError(e, privyUserId, { "Content-Type": "application/json" });
  }
});
