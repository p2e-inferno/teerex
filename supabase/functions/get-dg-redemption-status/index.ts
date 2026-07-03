/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import {
  loadDgRedemptionConfig,
  normalizeValidatedDgRedemptionFailure,
  publicDgRedemptionIntentWithAdminNotify,
  reconcileDgRedemptionPaystackTransfer,
} from "../_shared/dg-redemption.ts";
import {
  canReconcileUsdcFeeTransfer,
  canReconcileUsdcPayout,
  reconcileUsdcFeeTransfer,
  reconcileUsdcPayout,
} from "../_shared/dg-redemption-payout.ts";
import { alertIfNewlyManualReview } from "../_shared/dg-redemption-notify.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function reconcilePaystackTransfer(supabase: any, intent: any) {
  return await reconcileDgRedemptionPaystackTransfer(supabase, intent, {
    failedStatus: "manual_review",
    logPrefix: "get-dg-redemption-status",
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
    const intentId = String(body.intent_id || body.intentId || "").trim();
    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("dg_redemption_intents")
      .select("*")
      .eq("id", intentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return json({ ok: false, error: "Redeem DG request was not found" }, 404);

    const normalized = await normalizeValidatedDgRedemptionFailure(supabase, data);
    let redemption = await reconcilePaystackTransfer(supabase, normalized);
    // Compare against the raw row so normalize-driven failed -> manual_review flips also alert.
    await alertIfNewlyManualReview({
      supabase,
      before: data,
      after: redemption,
      reason: redemption.last_error || "paystack_transfer_failed",
      actorUserId: userId,
      logPrefix: "get-dg-redemption-status",
    });
    if (canReconcileUsdcPayout(redemption)) {
      const [config, network] = await Promise.all([
        loadDgRedemptionConfig(supabase),
        validateChain(supabase, redemption.chain_id),
      ]);
      if (network) {
        redemption = await reconcileUsdcPayout({
          supabase,
          intent: redemption,
          network,
          requiredConfirmations: config.required_confirmations,
          actorUserId: userId,
          logPrefix: "get-dg-redemption-status",
        });
      }
    }
    if (canReconcileUsdcFeeTransfer(redemption)) {
      const [config, network] = await Promise.all([
        loadDgRedemptionConfig(supabase),
        validateChain(supabase, redemption.chain_id),
      ]);
      if (network) {
        redemption = await reconcileUsdcFeeTransfer({
          supabase,
          intent: redemption,
          network,
          requiredConfirmations: config.required_confirmations,
          actorUserId: userId,
          logPrefix: "get-dg-redemption-status",
        });
      }
    }

    return json({ ok: true, redemption: await publicDgRedemptionIntentWithAdminNotify(supabase, redemption) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token")
      ? 401
      : lower.includes("not found")
      ? 404
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
