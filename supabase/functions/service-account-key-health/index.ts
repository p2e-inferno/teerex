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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { count: successCount } = await supabase
      .from("paystack_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "success");

    const { count: pendingCount } = await supabase
      .from("paystack_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: failedCount } = await supabase
      .from("paystack_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");

    const { data: stuckRefs } = await supabase
      .from("paystack_transactions")
      .select("id, reference, event_id, created_at, gateway_response")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(50);

    const stuck = (stuckRefs || []).reduce((acc: any[], tx: any) => {
      const grantedRaw = tx?.gateway_response?.key_granted;
      const granted = grantedRaw === true || grantedRaw === "true";
      if (!granted) {
        acc.push({
          id: tx.id,
          reference: tx.reference,
          event_id: tx.event_id,
          created_at: tx.created_at,
          key_granted: granted,
        });
      }
      return acc;
    }, []);

    const { data: attempts } = await supabase
      .from("key_grant_attempts")
      .select("payment_transaction_id, status, attempt_number, error_message, grant_tx_hash, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    return new Response(
      JSON.stringify({
        ok: true,
        stats: {
          success: successCount || 0,
          pending: pendingCount || 0,
          failed: failedCount || 0,
        },
        stuck,
        attempts: attempts || [],
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
