/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import {
  loadDgRedemptionConfig,
  normalizeValidatedDgRedemptionFailure,
  publicDgRedemptionIntentWithAdminNotify,
  reconcileDgRedemptionPaystackTransfer,
} from "../_shared/dg-redemption.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const url = new URL(req.url);
    const limit = clampInteger(url.searchParams.get("limit"), 5, 1, 25);
    const offset = clampInteger(url.searchParams.get("offset"), 0, 0, 10_000);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [config, redemptions] = await Promise.all([
      loadDgRedemptionConfig(supabase),
      supabase
        .from("dg_redemption_intents")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
    ]);

    if (redemptions.error) throw new Error(redemptions.error.message);

    const normalizedRedemptions = await Promise.all(
      (redemptions.data || []).map((intent: any) => normalizeValidatedDgRedemptionFailure(supabase, intent)),
    );
    const reconciledRedemptions = await Promise.all(
      normalizedRedemptions.map((intent: any) =>
        reconcileDgRedemptionPaystackTransfer(supabase, intent, {
          failedStatus: "manual_review",
          logPrefix: "list-user-dg-redemptions",
        })
      ),
    );
    const publicRedemptions = await Promise.all(
      reconciledRedemptions.map((intent: any) => publicDgRedemptionIntentWithAdminNotify(supabase, intent)),
    );

    return json({
      ok: true,
      redemptions: publicRedemptions,
      pagination: {
        total: redemptions.count || 0,
        limit,
        offset,
        has_more: (redemptions.count || 0) > offset + publicRedemptions.length,
      },
      limits: {
        min_dg: config.limits.min_dg,
        max_dg: config.limits.max_dg,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token") ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});
