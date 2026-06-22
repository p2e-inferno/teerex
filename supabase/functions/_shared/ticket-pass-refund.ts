/* deno-lint-ignore-file no-explicit-any */
import { ethers } from "https://esm.sh/ethers@6.14.4";
import {
  sendEmail,
  getTicketPassReviewBuyerEmail,
  getTicketPassReviewOpsEmail,
  getTicketPassRefundedBuyerEmail,
  getTicketPassAutoRefundOpsEmail,
} from "./email-utils.ts";
import { refundPaystackTransaction } from "./paystack.ts";

export type TicketPassRefundStatus = "pending" | "processing" | "needs_attention" | "failed" | "processed";
export type TicketPassRefundOrderStatus =
  | "REFUND_PENDING"
  | "REFUND_NEEDS_ATTENTION"
  | "REFUND_FAILED"
  | "REFUNDED";

/**
 * Refundable reasons that are unambiguous "paid, nothing minted, won't self-heal" failures, so the
 * fiat refund is issued automatically. Every other refundable reason goes to manual review instead.
 */
export const AUTO_REFUND_REASONS = new Set(["IssuanceDisabled", "PassClosed", "NotGranter"]);

function normalizeRefundStatus(value: unknown): TicketPassRefundStatus {
  const status = String(value || "pending").toLowerCase().replace(/[-\s]+/g, "_");
  if (status === "processed") return "processed";
  if (status === "failed") return "failed";
  if (status === "needs_attention") return "needs_attention";
  if (status === "processing") return "processing";
  return "pending";
}

export function ticketPassOrderStatusForRefundStatus(
  status: TicketPassRefundStatus,
): TicketPassRefundOrderStatus {
  if (status === "processed") return "REFUNDED";
  if (status === "failed") return "REFUND_FAILED";
  if (status === "needs_attention") return "REFUND_NEEDS_ATTENTION";
  return "REFUND_PENDING";
}

export function canApplyPaystackRefundStatus(params: {
  currentOrderStatus?: unknown;
  currentRefundStatus?: unknown;
  nextRefundStatus: unknown;
}): boolean {
  const currentOrderStatus = String(params.currentOrderStatus || "").toUpperCase();
  const currentRefundStatus = params.currentRefundStatus == null
    ? null
    : normalizeRefundStatus(params.currentRefundStatus);
  const nextRefundStatus = normalizeRefundStatus(params.nextRefundStatus);

  if (currentOrderStatus === "DISPENSED") return false;
  if (currentOrderStatus === "REFUNDED" || currentRefundStatus === "processed") {
    return nextRefundStatus === "processed";
  }
  if (currentOrderStatus === "REFUND_FAILED" || currentRefundStatus === "failed") {
    return nextRefundStatus === "failed" || nextRefundStatus === "needs_attention" || nextRefundStatus === "processed";
  }
  if (currentOrderStatus === "REFUND_NEEDS_ATTENTION" || currentRefundStatus === "needs_attention") {
    return nextRefundStatus === "needs_attention" || nextRefundStatus === "failed" || nextRefundStatus === "processed";
  }
  return true;
}

function refundId(refund: any): string | null {
  const id = refund?.id ?? refund?.refund_id;
  return id === undefined || id === null ? null : String(id);
}

function refundReference(refund: any): string | null {
  const reference = refund?.reference ?? refund?.refund_reference;
  return typeof reference === "string" && reference.trim() ? reference.trim() : null;
}

function refundAmountKobo(refund: any): number | null {
  const amount = Number(refund?.amount ?? refund?.refund_amount);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function refundError(refund: any, status: TicketPassRefundStatus): string | null {
  if (status === "failed") {
    return String(refund?.reason || refund?.message || refund?.gateway_response || "paystack_refund_failed");
  }
  if (status === "needs_attention") return "paystack_refund_needs_attention";
  return null;
}

export function transactionReferenceFromPaystackRefund(refund: any): string | null {
  const direct = refund?.transaction_reference ?? refund?.transactionReference;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const transaction = refund?.transaction;
  if (typeof transaction?.reference === "string" && transaction.reference.trim()) return transaction.reference.trim();
  if (typeof transaction === "string" && transaction.trim() && !/^\d+$/.test(transaction.trim())) return transaction.trim();
  return null;
}

export function paystackRefundUpdateValues(params: {
  refund: any;
  now?: string;
  markRequested?: boolean;
}): Record<string, unknown> {
  const now = params.now || new Date().toISOString();
  const status = normalizeRefundStatus(params.refund?.status);
  const values: Record<string, unknown> = {
    status: ticketPassOrderStatusForRefundStatus(status),
    refund_status: status,
    refund_last_synced_at: now,
    refund_error: refundError(params.refund, status),
    issuance_lock_id: null,
    issuance_locked_at: null,
    last_error: refundError(params.refund, status),
  };
  const id = refundId(params.refund);
  const reference = refundReference(params.refund);
  const amount = refundAmountKobo(params.refund);
  if (id) values.refund_id = id;
  if (reference) values.refund_reference = reference;
  if (amount !== null) values.refund_amount_kobo = amount;
  if (params.markRequested) values.refund_requested_at = now;
  if (status === "processed") {
    values.refund_processed_at = params.refund?.refunded_at || params.refund?.processed_at || now;
    values.last_error = null;
  }
  return values;
}

export function appendPaystackRefundGatewayResponse(
  current: Record<string, unknown> | null | undefined,
  refund: any,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...(current || {}),
    paystack_refund: {
      ...(typeof current?.paystack_refund === "object" && current.paystack_refund ? current.paystack_refund : {}),
      ...metadata,
      refund,
      synced_at: new Date().toISOString(),
    },
  };
}

/**
 * Outcome of a failed grantAndDispense, derived from the revert reason:
 *  - fulfilled : the order was already processed on-chain (idempotency) — reconcile, never refund.
 *  - refundable: paid but nothing delivered and a retry can't fix it — flag for manual review/refund.
 *  - retryable : transient (gas/nonce/RPC) or unknown — leave for another attempt.
 *
 * Backed by the atomicity guarantee of grantAndDispense: a revert rolls back the key mint, the
 * payout, and processedOrder[orderRef] together, so a revert always means nothing was delivered.
 */
export type GrantDispenseOutcome = "fulfilled" | "refundable" | "retryable";

const ERROR_OUTCOMES: Array<{ sig: string; outcome: GrantDispenseOutcome }> = [
  // Controller (TeeRexTicketPassControllerV1).
  { sig: "OrderAlreadyProcessed()", outcome: "fulfilled" },
  { sig: "IssuanceDisabled()", outcome: "refundable" },
  { sig: "PassClosed()", outcome: "refundable" },
  { sig: "SoldOut()", outcome: "refundable" },
  { sig: "PerBuyerLimitReached()", outcome: "refundable" },
  { sig: "NotGranter()", outcome: "refundable" },
  { sig: "UnknownPass()", outcome: "refundable" },
  { sig: "InvalidRecipient()", outcome: "refundable" },
  { sig: "AlreadyRedeemed()", outcome: "refundable" },
  { sig: "PayoutNativeTransferFailed()", outcome: "refundable" },
  // PublicLock (propagated through grantKeys; not in the controller ABI, matched by selector).
  { sig: "MIGRATION_REQUIRED()", outcome: "refundable" },
  { sig: "ONLY_LOCK_MANAGER_OR_KEY_GRANTER()", outcome: "refundable" },
  { sig: "INVALID_ADDRESS()", outcome: "refundable" },
];

const SELECTOR_TO_ERROR = new Map<string, { name: string; outcome: GrantDispenseOutcome }>();
const NAME_TO_OUTCOME = new Map<string, GrantDispenseOutcome>();
for (const { sig, outcome } of ERROR_OUTCOMES) {
  const name = sig.replace("()", "");
  SELECTOR_TO_ERROR.set(ethers.id(sig).slice(0, 10).toLowerCase(), { name, outcome });
  NAME_TO_OUTCOME.set(name, outcome);
}

function extractRevertData(err: any): string | null {
  const candidates = [err?.data, err?.info?.error?.data, err?.error?.data, err?.revert?.data, err?.value];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("0x") && c.length >= 10) return c.toLowerCase();
  }
  return null;
}

function shortReason(err: any): string {
  return err?.shortMessage || err?.reason || err?.message || "unknown_error";
}

/**
 * Map an ethers revert error to an outcome, in order of reliability:
 * decoded custom-error name → 4-byte selector → substring fallback. Defaults to `retryable` so an
 * unrecognized revert is never treated as definitively refundable.
 */
export function classifyGrantDispenseError(err: any): { outcome: GrantDispenseOutcome; reason: string } {
  const revertName: string | undefined = err?.revert?.name;
  if (revertName && NAME_TO_OUTCOME.has(revertName)) {
    return { outcome: NAME_TO_OUTCOME.get(revertName)!, reason: revertName };
  }

  const data = extractRevertData(err);
  if (data) {
    const hit = SELECTOR_TO_ERROR.get(data.slice(0, 10));
    if (hit) return { outcome: hit.outcome, reason: hit.name };
  }

  const hay = `${err?.shortMessage ?? ""} ${err?.reason ?? ""} ${err?.message ?? ""}`;
  for (const [name, outcome] of NAME_TO_OUTCOME) {
    if (hay.includes(name)) return { outcome, reason: name };
  }

  return { outcome: "retryable", reason: revertName || shortReason(err) };
}

/**
 * Re-simulate the grant to obtain a deterministic, decodable revert. A simulation that succeeds
 * means the on-chain state allows the grant, so the original failure was transient (retryable).
 */
export async function classifyGrantFailure(params: {
  controller: any;
  lockAddress: string;
  recipient: string;
  orderRef: string;
  originalError: any;
}): Promise<{ outcome: GrantDispenseOutcome; reason: string }> {
  const { controller, lockAddress, recipient, orderRef, originalError } = params;
  try {
    await controller.grantAndDispense.staticCall(lockAddress, recipient, orderRef);
    return { outcome: "retryable", reason: shortReason(originalError) };
  } catch (simErr: any) {
    return classifyGrantDispenseError(simErr);
  }
}

/**
 * Notify ops (actionable) and the buyer (reassurance) that an order was flagged for manual review.
 * Best-effort: caller must not let a failure here mask the flagging itself.
 */
export async function notifyTicketPassNeedsReview(params: {
  supabase: any;
  order: any;
  pass: any;
  reason: string;
}): Promise<void> {
  const { supabase, order, pass, reason } = params;

  const { data: o } = await supabase
    .from("ticket_pass_orders")
    .select("id, buyer_email, buyer_address, amount_fiat, fiat_symbol, payment_reference")
    .eq("id", order.id)
    .maybeSingle();
  const { data: p } = await supabase
    .from("ticket_passes")
    .select("title")
    .eq("id", pass.id)
    .maybeSingle();

  const passTitle = p?.title || "your ticket pass";
  const amount = o?.amount_fiat != null ? `${o.fiat_symbol || "NGN"} ${o.amount_fiat}` : "—";

  const finalStatus = String(updated.status || refundValues.status);
  const opsEmail = Deno.env.get("OPS_ALERT_EMAIL");
  if (opsEmail) {
    const t = getTicketPassReviewOpsEmail({
      orderId: o?.id || order.id,
      passTitle,
      reason,
      amount,
      reference: o?.payment_reference || "—",
      buyerEmail: o?.buyer_email || null,
      buyerAddress: o?.buyer_address || null,
    });
    await sendEmail({ to: opsEmail, subject: t.subject, text: t.text, html: t.html, tags: ["ticket-pass-review"] });
  } else {
    console.warn("[ticket-pass-refund] OPS_ALERT_EMAIL not set; skipping ops alert");
  }

  if (o?.buyer_email) {
    const t = getTicketPassReviewBuyerEmail({ passTitle, amount });
    await sendEmail({ to: o.buyer_email, subject: t.subject, text: t.text, html: t.html, tags: ["ticket-pass-review"] });
  }
}

async function flagNeedsReviewDirect(params: {
  supabase: any;
  order: any;
  pass: any;
  reason: string;
  lockId: string;
  lastError: string;
}): Promise<{ ok: true; needs_review: true; review_reason: string }> {
  const { supabase, order, pass, reason, lockId, lastError } = params;
  const { data, error } = await supabase
    .from("ticket_pass_orders")
    .update({ status: "NEEDS_REVIEW", last_error: lastError, issuance_lock_id: null, issuance_locked_at: null })
    .eq("id", order.id)
    .eq("issuance_lock_id", lockId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("ticket_pass_review_lock_lost");
  await notifyTicketPassNeedsReview({ supabase, order, pass, reason }).catch((e: any) =>
    console.warn(`[ticket-pass-refund] [${order.id}] review notification failed:`, e?.message)
  );
  return { ok: true, needs_review: true, review_reason: reason };
}

/**
 * Auto-refund a paid-but-undelivered order for an unambiguous no-delivery reason. Paystack refunds
 * settle asynchronously, so the order is final only after Paystack reports the refund as processed.
 */
export async function autoRefundTicketPassOrder(params: {
  supabase: any;
  order: any;
  pass: any;
  reason: string;
  lockId: string;
}): Promise<{ ok: true; refunded?: boolean; refund_pending?: boolean; needs_review?: boolean; review_reason?: string }> {
  const { supabase, order, pass, reason, lockId } = params;
  const nowIso = new Date().toISOString();

  const { data: o } = await supabase
    .from("ticket_pass_orders")
    .select("payment_provider, payment_reference, amount_fiat, fiat_symbol, buyer_email, gateway_response")
    .eq("id", order.id)
    .maybeSingle();
  const { data: p } = await supabase.from("ticket_passes").select("title").eq("id", pass.id).maybeSingle();
  const passTitle = p?.title || "your ticket pass";
  const amount = o?.amount_fiat != null ? `${o.fiat_symbol || "NGN"} ${o.amount_fiat}` : "—";

  if (o?.payment_provider !== "paystack" || !o?.payment_reference) {
    return await flagNeedsReviewDirect({ supabase, order, pass, reason, lockId, lastError: `needs_review:${reason}` });
  }

  const refund = await refundPaystackTransaction({
    reference: o.payment_reference,
    customerNote: "Refund for undelivered TeeRex ticket pass",
    merchantNote: `Auto-refund ticket pass order ${order.id}: ${reason}`,
  });
  if (!refund.ok) {
    return await flagNeedsReviewDirect({ supabase, order, pass, reason, lockId, lastError: `auto_refund_failed:${refund.error}` });
  }

  const refundId = refund.data?.id != null ? String(refund.data.id) : null;
  const refundValues = paystackRefundUpdateValues({ refund: refund.data, now: nowIso, markRequested: true });
  const updatePayload = {
    ...refundValues,
    gateway_response: appendPaystackRefundGatewayResponse(o.gateway_response || {}, refund.data, {
      source: "auto_refund",
      reason,
      requested_at: nowIso,
    }),
  };
  let { data: updated, error: updateError } = await supabase
    .from("ticket_pass_orders")
    .update(updatePayload)
    .eq("id", order.id)
    .eq("issuance_lock_id", lockId)
    .select("id,status,refund_status")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    const { data: current, error: currentError } = await supabase
      .from("ticket_pass_orders")
      .select("id,status,refund_status")
      .eq("id", order.id)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (current?.status === "REFUNDED" || String(current?.status || "").startsWith("REFUND_")) {
      updated = current;
    } else {
      const fallback = await supabase
        .from("ticket_pass_orders")
        .update(updatePayload)
        .eq("id", order.id)
        .not("status", "eq", "DISPENSED")
        .not("status", "eq", "REFUNDED")
        .select("id,status,refund_status")
        .maybeSingle();
      if (fallback.error) throw new Error(fallback.error.message);
      if (!fallback.data) throw new Error("ticket_pass_refund_record_update_failed");
      updated = fallback.data;
    }
  }

  const opsEmail = Deno.env.get("OPS_ALERT_EMAIL");
  if (opsEmail) {
    const t = getTicketPassAutoRefundOpsEmail({
      orderId: order.id,
      passTitle,
      reason,
      amount,
      reference: o.payment_reference,
      buyerEmail: o.buyer_email || null,
      refundId,
    });
    await sendEmail({ to: opsEmail, subject: t.subject, text: t.text, html: t.html, tags: ["ticket-pass-refund"] }).catch(() => {});
  }
  if (o.buyer_email && finalStatus === "REFUNDED") {
    const t = getTicketPassRefundedBuyerEmail({ passTitle, amount });
    await sendEmail({ to: o.buyer_email, subject: t.subject, text: t.text, html: t.html, tags: ["ticket-pass-refund"] }).catch(() => {});
  }

  return { ok: true, refunded: finalStatus === "REFUNDED", refund_pending: finalStatus !== "REFUNDED" };
}
