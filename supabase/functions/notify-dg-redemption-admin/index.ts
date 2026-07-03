/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getDgRedemptionReviewOpsEmail, sendEmail } from "../_shared/email-utils.ts";
import {
  getDgRedemptionAdminNotifyCooldownSeconds,
  getNextDgRedemptionAdminNotifyAt,
  publicDgRedemptionIntent,
} from "../_shared/dg-redemption.ts";
import { buildDgRedemptionReviewOpsEmailParams } from "../_shared/dg-redemption-notify.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

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
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const userId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const intentId = String(body.intent_id || body.intentId || "").trim();
    if (!intentId) return json({ ok: false, error: "Redeem DG request is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: intent, error: intentError } = await supabase
      .from("dg_redemption_intents")
      .select("*")
      .eq("id", intentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (intentError) throw new Error(intentError.message);
    if (!intent) return json({ ok: false, error: "Redeem DG request was not found" }, 404);
    if (String(intent.status) !== "manual_review") {
      return json({ ok: false, error: "This Redeem DG request no longer needs admin review" }, 400);
    }

    const existingNextNotifyAt = await getNextDgRedemptionAdminNotifyAt(supabase, intent);
    if (existingNextNotifyAt) {
      return json({
        ok: false,
        error: "Admin has already been notified for this request",
        next_notify_at: existingNextNotifyAt,
      }, 429);
    }

    const opsEmail = Deno.env.get("OPS_ALERT_EMAIL");
    if (!opsEmail) {
      await supabase.from("dg_redemption_events").insert({
        intent_id: intent.id,
        event_type: "user_admin_notification_failed",
        actor_user_id: userId,
        actor_wallet_address: intent.wallet_address,
        metadata: { error: "OPS_ALERT_EMAIL is not configured" },
      });
      return json({ ok: false, error: "Admin email is not configured" }, 500);
    }

    const email = getDgRedemptionReviewOpsEmail(
      buildDgRedemptionReviewOpsEmailParams(intent, "user_requested_review"),
    );
    const result = await sendEmail({
      to: opsEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tags: ["dg-redemption", "admin-review"],
    });

    if (!result.ok) {
      await supabase.from("dg_redemption_events").insert({
        intent_id: intent.id,
        event_type: "user_admin_notification_failed",
        actor_user_id: userId,
        actor_wallet_address: intent.wallet_address,
        metadata: { error: result.error || "email_send_failed" },
      });
      return json({ ok: false, error: result.error || "Failed to notify admin" }, 502);
    }

    const notifiedAt = new Date().toISOString();
    const cooldownSeconds = getDgRedemptionAdminNotifyCooldownSeconds();
    const nextNotifyAt = new Date(new Date(notifiedAt).getTime() + cooldownSeconds * 1000).toISOString();
    await supabase.from("dg_redemption_events").insert({
      intent_id: intent.id,
      event_type: "user_admin_notification_sent",
      actor_user_id: userId,
      actor_wallet_address: intent.wallet_address,
      metadata: {
        message_id: result.messageId || null,
        next_notify_at: nextNotifyAt,
      },
    });

    return json({
      ok: true,
      status: intent.status,
      redemption: {
        ...publicDgRedemptionIntent(intent),
        next_admin_notify_at: nextNotifyAt,
      },
      next_notify_at: nextNotifyAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token")
      ? 401
      : lower.includes("not found")
      ? 404
      : lower.includes("required")
      ? 400
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
