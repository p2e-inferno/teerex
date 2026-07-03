import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDgRedemptionReviewOpsEmailParams } from "./dg-redemption-notify.ts";

const baseIntent = {
  id: "intent-1",
  chain_id: 84532,
  user_id: "did:privy:user",
  wallet_address: "0x1111111111111111111111111111111111111111",
  amount_dg_raw: "1000000000000000000",
  vendor_snapshot: { dg_decimals: 18 },
  tx_hash: "0xdeposit",
};

Deno.test("buildDgRedemptionReviewOpsEmailParams maps usdc payout to wallet + micro amount", () => {
  const params = buildDgRedemptionReviewOpsEmailParams({
    ...baseIntent,
    status: "manual_review",
    payout_method: "usdc",
    net_payout_usdc_micro: 4_700_000,
    payout_wallet_address: "0x3333333333333333333333333333333333333333",
    payout_tx_hash: "0xpayout",
    last_error: "usdc_payout_reverted",
  }, "usdc_payout_reverted");

  assertEquals(params.payoutMethod, "usdc");
  assertEquals(params.netPayout, "4.70 USDC");
  assertEquals(params.destination, "0x3333333333333333333333333333333333333333");
  assertEquals(params.payoutTxHash, "0xpayout");
  assertEquals(params.reason, "usdc_payout_reverted");
  assertEquals(params.lastError, "usdc_payout_reverted");
});

Deno.test("buildDgRedemptionReviewOpsEmailParams maps fee_transfer kind to fee amount + redemption wallet", () => {
  const params = buildDgRedemptionReviewOpsEmailParams({
    ...baseIntent,
    status: "completed",
    payout_method: "usdc",
    service_fee_usdc_micro: 300_000,
    redemption_wallet_address: "0x2222222222222222222222222222222222222222",
    fee_transfer_status: "manual_review",
    fee_transfer_tx_hash: "0xfee",
    fee_transfer_last_error: "usdc_fee_transfer_reverted",
  }, "usdc_fee_transfer_reverted", "fee_transfer");

  assertEquals(params.payoutMethod, "usdc");
  assertEquals(params.netPayout, "0.30 USDC (platform fee sweep)");
  assertEquals(params.destination, "0x2222222222222222222222222222222222222222");
  assertEquals(params.payoutTxHash, "0xfee");
  assertEquals(params.lastError, "usdc_fee_transfer_reverted");
});

Deno.test("buildDgRedemptionReviewOpsEmailParams maps ngn payout to masked bank + naira amount", () => {
  const params = buildDgRedemptionReviewOpsEmailParams({
    ...baseIntent,
    status: "manual_review",
    net_payout_kobo: 950_000,
    payout_snapshot: { bank_name: "Test Bank", account_number_last4: "6789" },
    last_error: "paystack_transfer_failed",
  }, "paystack_transfer_failed");

  assertEquals(params.payoutMethod, "ngn");
  assertEquals(params.netPayout, "NGN 9,500.00");
  assertEquals(params.destination, "Test Bank ******6789");
  assertEquals(params.payoutTxHash, null);
});
