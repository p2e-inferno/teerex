/* deno-lint-ignore-file no-explicit-any */
import { getDgRedemptionReviewOpsEmail, sendEmail } from "./email-utils.ts";
import {
  getDgRedemptionAdminNotifyCooldownSeconds,
  getDgRedemptionPayoutMethod,
  publicDgRedemptionIntent,
} from "./dg-redemption.ts";

export type DgRedemptionReviewAlertKind = "payout" | "fee_transfer";

// The sent-event type doubles as the cooldown dedup key, so each kind gets its own.
const ALERT_EVENTS: Record<DgRedemptionReviewAlertKind, { sent: string; failed: string; skipped: string }> = {
  payout: {
    sent: "admin_review_auto_alert_sent",
    failed: "admin_review_auto_alert_failed",
    skipped: "admin_review_auto_alert_skipped",
  },
  fee_transfer: {
    sent: "admin_fee_review_auto_alert_sent",
    failed: "admin_fee_review_auto_alert_failed",
    skipped: "admin_fee_review_auto_alert_skipped",
  },
};

function formatNairaFromKobo(value: unknown): string {
  const amount = Number(value || 0) / 100;
  return `NGN ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUsdcFromMicro(value: unknown): string {
  const amount = Number(value || 0) / 1_000_000;
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`;
}

export function buildDgRedemptionReviewOpsEmailParams(
  intent: any,
  reason: string,
  kind: DgRedemptionReviewAlertKind = "payout",
) {
  const method = getDgRedemptionPayoutMethod(intent);
  const pub = publicDgRedemptionIntent(intent);
  const snapshot = intent.payout_snapshot || {};
  if (kind === "fee_transfer") {
    return {
      intentId: String(intent.id),
      payoutMethod: method,
      reason,
      amountDg: String(pub.amount_dg ?? intent.amount_dg_raw ?? "unknown"),
      netPayout: `${formatUsdcFromMicro(intent.service_fee_usdc_micro)} (platform fee sweep)`,
      destination: String(intent.redemption_wallet_address || "unknown"),
      chainId: intent.chain_id,
      userId: String(intent.user_id || "unknown"),
      walletAddress: String(intent.wallet_address || "unknown"),
      depositTxHash: intent.tx_hash || null,
      payoutTxHash: intent.fee_transfer_tx_hash || null,
      lastError: intent.fee_transfer_last_error || null,
    };
  }
  const netPayout = method === "usdc"
    ? formatUsdcFromMicro(intent.net_payout_usdc_micro)
    : formatNairaFromKobo(intent.net_payout_kobo);
  const destination = method === "usdc"
    ? String(intent.payout_wallet_address || snapshot.payout_wallet_address || "unknown")
    : `${snapshot.bank_name || "unknown"} ******${snapshot.account_number_last4 || "unknown"}`;
  return {
    intentId: String(intent.id),
    payoutMethod: method,
    reason,
    amountDg: String(pub.amount_dg ?? intent.amount_dg_raw ?? "unknown"),
    netPayout,
    destination,
    chainId: intent.chain_id,
    userId: String(intent.user_id || "unknown"),
    walletAddress: String(intent.wallet_address || "unknown"),
    depositTxHash: intent.tx_hash || null,
    payoutTxHash: intent.payout_tx_hash || null,
    lastError: intent.last_error || null,
  };
}

async function alertedWithinCooldown(supabase: any, intentId: string, sentEventType: string): Promise<boolean> {
  const cooldownSeconds = getDgRedemptionAdminNotifyCooldownSeconds();
  const since = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from("dg_redemption_events")
    .select("id")
    .eq("intent_id", intentId)
    .eq("event_type", sentEventType)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// Best-effort ops alert when an intent enters manual review. Re-fetches the full intent so
// callers only pass an id, and is deduped within the admin-notify cooldown so reconcile
// polling and duplicate webhooks never spam ops. Never throws.
export async function alertAdminDgRedemptionReview(params: {
  supabase: any;
  intentId: string;
  reason: string;
  actorUserId?: string | null;
  logPrefix?: string;
  kind?: DgRedemptionReviewAlertKind;
}): Promise<void> {
  const { supabase, intentId, reason } = params;
  const kind = params.kind || "payout";
  const events = ALERT_EVENTS[kind];
  const logPrefix = params.logPrefix || "dg-redemption";
  try {
    if (!intentId) return;

    const { data: intent, error } = await supabase
      .from("dg_redemption_intents")
      .select("*")
      .eq("id", intentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!intent) return;
    const needsReview = kind === "fee_transfer"
      ? String(intent.fee_transfer_status) === "manual_review"
      : String(intent.status) === "manual_review";
    if (!needsReview) return;
    if (await alertedWithinCooldown(supabase, intentId, events.sent)) return;

    const opsEmail = Deno.env.get("OPS_ALERT_EMAIL");
    if (!opsEmail) {
      await supabase.from("dg_redemption_events").insert({
        intent_id: intentId,
        event_type: events.skipped,
        actor_user_id: params.actorUserId || intent.user_id,
        actor_wallet_address: intent.wallet_address,
        metadata: { reason, error: "OPS_ALERT_EMAIL is not configured" },
      });
      console.warn(`[${logPrefix}] OPS_ALERT_EMAIL not set; skipping admin review alert`);
      return;
    }

    const email = getDgRedemptionReviewOpsEmail(buildDgRedemptionReviewOpsEmailParams(intent, reason, kind));
    const result = await sendEmail({
      to: opsEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tags: ["dg-redemption", "admin-review"],
    });

    // A failed sent-event insert would defeat cooldown dedup, so surface it in logs.
    const { error: eventError } = await supabase.from("dg_redemption_events").insert({
      intent_id: intentId,
      event_type: result.ok ? events.sent : events.failed,
      actor_user_id: params.actorUserId || intent.user_id,
      actor_wallet_address: intent.wallet_address,
      metadata: result.ok
        ? { reason, message_id: result.messageId || null }
        : { reason, error: result.error || "email_send_failed" },
    });
    if (eventError) {
      console.warn(`[${logPrefix}] admin review alert event insert failed`, eventError.message);
    }
  } catch (error) {
    console.warn(`[${logPrefix}] admin review alert failed`, error instanceof Error ? error.message : error);
  }
}

// Convenience for read-path reconciles that live outside a write-site: only alert when a
// reconcile actually flipped the intent into manual review this call.
export async function alertIfNewlyManualReview(params: {
  supabase: any;
  before: any;
  after: any;
  reason: string;
  actorUserId?: string | null;
  logPrefix?: string;
}): Promise<void> {
  if (String(params.before?.status) === "manual_review") return;
  if (String(params.after?.status) !== "manual_review") return;
  await alertAdminDgRedemptionReview({
    supabase: params.supabase,
    intentId: String(params.after.id),
    reason: params.reason,
    actorUserId: params.actorUserId,
    logPrefix: params.logPrefix,
  });
}
