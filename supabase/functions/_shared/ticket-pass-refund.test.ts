import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import {
  classifyGrantDispenseError,
  AUTO_REFUND_REASONS,
  canApplyPaystackRefundStatus,
  paystackRefundUpdateValues,
  transactionReferenceFromPaystackRefund,
} from "./ticket-pass-refund.ts";

const selector = (sig: string) => ethers.id(sig).slice(0, 10);

Deno.test("classifies a decoded custom-error name", () => {
  const { outcome, reason } = classifyGrantDispenseError({ revert: { name: "IssuanceDisabled" } });
  assertEquals(outcome, "refundable");
  assertEquals(reason, "IssuanceDisabled");
});

Deno.test("OrderAlreadyProcessed is fulfilled, never refundable", () => {
  const { outcome, reason } = classifyGrantDispenseError({ data: selector("OrderAlreadyProcessed()") });
  assertEquals(outcome, "fulfilled");
  assertEquals(reason, "OrderAlreadyProcessed");
});

Deno.test("classifies a controller error by 4-byte selector", () => {
  const { outcome, reason } = classifyGrantDispenseError({ data: selector("PassClosed()") + "00".repeat(4) });
  assertEquals(outcome, "refundable");
  assertEquals(reason, "PassClosed");
});

Deno.test("classifies a propagated PublicLock error by selector", () => {
  const { outcome, reason } = classifyGrantDispenseError({
    info: { error: { data: selector("ONLY_LOCK_MANAGER_OR_KEY_GRANTER()") } },
  });
  assertEquals(outcome, "refundable");
  assertEquals(reason, "ONLY_LOCK_MANAGER_OR_KEY_GRANTER");
});

Deno.test("falls back to substring match on the message", () => {
  const { outcome, reason } = classifyGrantDispenseError({ message: "execution reverted: SoldOut" });
  assertEquals(outcome, "refundable");
  assertEquals(reason, "SoldOut");
});

Deno.test("unknown reverts default to retryable", () => {
  const { outcome } = classifyGrantDispenseError({ data: "0xdeadbeef", message: "nonce too low" });
  assertEquals(outcome, "retryable");
});

Deno.test("only the unambiguous no-delivery reasons auto-refund, and each is refundable", () => {
  assertEquals([...AUTO_REFUND_REASONS].sort(), ["IssuanceDisabled", "NotGranter", "PassClosed"]);
  for (const reason of AUTO_REFUND_REASONS) {
    assertEquals(classifyGrantDispenseError({ revert: { name: reason } }).outcome, "refundable");
  }
});

Deno.test("maps pending and processing refunds to REFUND_PENDING", () => {
  assertEquals(paystackRefundUpdateValues({ refund: { status: "pending" } }).status, "REFUND_PENDING");
  assertEquals(paystackRefundUpdateValues({ refund: { status: "processing" } }).status, "REFUND_PENDING");
});

Deno.test("maps needs-attention refunds to admin-actionable status", () => {
  const values = paystackRefundUpdateValues({ refund: { status: "needs-attention", id: 123 } });
  assertEquals(values.status, "REFUND_NEEDS_ATTENTION");
  assertEquals(values.refund_status, "needs_attention");
  assertEquals(values.refund_id, "123");
});

Deno.test("maps failed refunds to REFUND_FAILED", () => {
  const values = paystackRefundUpdateValues({ refund: { status: "failed", reason: "processor_declined" } });
  assertEquals(values.status, "REFUND_FAILED");
  assertEquals(values.refund_error, "processor_declined");
});

Deno.test("maps processed refunds to terminal REFUNDED", () => {
  const values = paystackRefundUpdateValues({ refund: { status: "processed", refunded_at: "2026-06-21T10:00:00.000Z" } });
  assertEquals(values.status, "REFUNDED");
  assertEquals(values.refund_status, "processed");
  assertEquals(values.refund_processed_at, "2026-06-21T10:00:00.000Z");
  assertEquals(values.last_error, null);
});

Deno.test("refund status guard prevents stale webhook regression after processed", () => {
  assertEquals(canApplyPaystackRefundStatus({
    currentOrderStatus: "REFUNDED",
    currentRefundStatus: "processed",
    nextRefundStatus: "pending",
  }), false);
  assertEquals(canApplyPaystackRefundStatus({
    currentOrderStatus: "REFUNDED",
    currentRefundStatus: "processed",
    nextRefundStatus: "processed",
  }), true);
});

Deno.test("refund status guard does not downgrade failed refund issues to pending", () => {
  assertEquals(canApplyPaystackRefundStatus({
    currentOrderStatus: "REFUND_FAILED",
    currentRefundStatus: "failed",
    nextRefundStatus: "processing",
  }), false);
  assertEquals(canApplyPaystackRefundStatus({
    currentOrderStatus: "REFUND_FAILED",
    currentRefundStatus: "failed",
    nextRefundStatus: "processed",
  }), true);
});

Deno.test("extracts original transaction reference from refund payloads", () => {
  assertEquals(transactionReferenceFromPaystackRefund({ transaction_reference: "ref_1" }), "ref_1");
  assertEquals(transactionReferenceFromPaystackRefund({ transaction: { reference: "ref_2" } }), "ref_2");
});
