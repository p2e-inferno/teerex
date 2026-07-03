import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canApplyPaystackTransferStatus,
  calculateFees,
  calculateUsdcFees,
  DEFAULT_DG_REDEMPTION_CONFIG,
  isDgRedemptionManuallyPayable,
  mapPaystackTransferStatus,
  normalizeDgRedemptionConfig,
  publicDgRedemptionIntent,
  validateDgRedemptionConfigForSave,
} from "./dg-redemption.ts";

Deno.test("normalizeDgRedemptionConfig keeps safe defaults", () => {
  const config = normalizeDgRedemptionConfig({});

  assertEquals(config.enabled, false);
  assertEquals(config.service_fee.bps, 300);
  assertEquals(config.service_fee.min_kobo, 50_000);
  assertEquals(config.service_fee.max_kobo, 1_500_000);
  assertEquals(config.limits.min_gross_ngn_kobo, 0);
  assertEquals(config.tax.enabled, false);
  assertEquals(config.tax.vat_bps, 750);
  assertEquals(config.tax.basis, "service_fee");
});

Deno.test("normalizeDgRedemptionConfig clamps invalid fee and tax values", () => {
  const config = normalizeDgRedemptionConfig({
    service_fee: {
      bps: 20_000,
      min_kobo: -100,
      max_kobo: 10,
    },
    tax: {
      enabled: true,
      vat_bps: 99_999,
      basis: "gross",
    },
  });

  assertEquals(config.service_fee.bps, 10_000);
  assertEquals(config.service_fee.min_kobo, 0);
  assertEquals(config.service_fee.max_kobo, 10);
  assertEquals(config.tax.enabled, true);
  assertEquals(config.tax.vat_bps, 10_000);
  assertEquals(config.tax.basis, "none");
});

Deno.test("calculateFees applies service fee min and audits vendor conversion fee once", () => {
  const result = calculateFees({
    grossValueKobo: 1_000_000,
    vendorFeeKobo: 100_000,
    config: DEFAULT_DG_REDEMPTION_CONFIG,
  });

  assertEquals(result.serviceFeeKobo, 50_000);
  assertEquals(result.vatKobo, 0);
  assertEquals(result.vatBasisKobo, 0);
  assertEquals(result.totalFeeKobo, 150_000);
  assertEquals(result.netPayoutKobo, 950_000);
});

Deno.test("calculateFees applies VAT only to service fee when enabled", () => {
  const config = normalizeDgRedemptionConfig({
    ...DEFAULT_DG_REDEMPTION_CONFIG,
    tax: {
      enabled: true,
      vat_bps: 750,
      basis: "service_fee",
    },
  });
  const result = calculateFees({
    grossValueKobo: 10_000_000,
    vendorFeeKobo: 0,
    config,
  });

  assertEquals(result.serviceFeeKobo, 300_000);
  assertEquals(result.vatKobo, 22_500);
  assertEquals(result.vatBasisKobo, 300_000);
  assertEquals(result.totalFeeKobo, 322_500);
  assertEquals(result.netPayoutKobo, 9_677_500);
});

Deno.test("validateDgRedemptionConfigForSave rejects invalid admin fee config", () => {
  try {
    validateDgRedemptionConfigForSave({
      ...DEFAULT_DG_REDEMPTION_CONFIG,
      service_fee: {
        bps: 20_000,
        min_kobo: 50_000,
        max_kobo: 1_500_000,
      },
    }, []);
    throw new Error("expected validation to fail");
  } catch (error) {
    assertEquals((error as Error).message, "Service fee bps must be an integer between 0 and 10000");
  }
});

Deno.test("validateDgRedemptionConfigForSave rejects missing wallet for enabled chain", () => {
  try {
    validateDgRedemptionConfigForSave({
      ...DEFAULT_DG_REDEMPTION_CONFIG,
      supported_chains: [8453],
      wallets_by_chain: {},
    }, [{
      chain_id: 8453,
      chain_name: "Base",
      rpc_url: null,
      unlock_factory_address: null,
      refundable_event_manager_address: null,
      ticket_pass_controller_address: null,
      usdc_token_address: null,
      dg_token_address: null,
      g_token_address: null,
      up_token_address: null,
      dg_vendor_address: null,
      uniswap_v3_quoter_address: null,
      uniswap_v3_weth_address: null,
      uniswap_v3_eth_usdc_pool_address: null,
      uniswap_v3_up_weth_fee: null,
      uniswap_v3_weth_usdc_fee: null,
      is_active: true,
    }]);
    throw new Error("expected validation to fail");
  } catch (error) {
    assertEquals((error as Error).message, "Redemption wallet is required for chain 8453");
  }
});

Deno.test("Paystack status mapping prevents stale pending regression", () => {
  assertEquals(mapPaystackTransferStatus({ event: "transfer.success", status: "success" }), "completed");
  assertEquals(mapPaystackTransferStatus({ status: "successful" }), "completed");
  assertEquals(mapPaystackTransferStatus({ event: "transfer.reversed", status: "reversed" }), "failed");
  assertEquals(canApplyPaystackTransferStatus({
    currentStatus: "completed",
    nextStatus: "payout_processing",
    event: "transfer.pending",
  }), false);
  assertEquals(canApplyPaystackTransferStatus({
    currentStatus: "completed",
    nextStatus: "failed",
    event: "transfer.reversed",
  }), true);
});

Deno.test("normalizeDgRedemptionConfig keeps usdc defaults", () => {
  const config = normalizeDgRedemptionConfig({});

  assertEquals(config.usdc.enabled, false);
  assertEquals(config.usdc.balance_cap_enabled, true);
  assertEquals(config.usdc.service_fee.bps, 300);
  assertEquals(config.usdc.service_fee.min_usdc_micro, 300_000);
  assertEquals(config.usdc.service_fee.max_usdc_micro, 10_000_000);
  assertEquals(config.usdc.limits.min_gross_usdc_micro, 0);
  assertEquals(config.usdc.limits.per_user_daily_usdc_micro, 500_000_000);
  assertEquals(config.usdc.limits.platform_daily_usdc_micro, 5_000_000_000);
  assertEquals(config.usdc.limits.manual_review_usdc_micro, 250_000_000);
});

Deno.test("normalizeDgRedemptionConfig clamps invalid usdc fee values", () => {
  const config = normalizeDgRedemptionConfig({
    usdc: {
      enabled: true,
      service_fee: { bps: 20_000, min_usdc_micro: -5, max_usdc_micro: 10 },
      limits: { per_user_daily_usdc_micro: -1 },
    },
  });

  assertEquals(config.usdc.enabled, true);
  assertEquals(config.usdc.service_fee.bps, 10_000);
  assertEquals(config.usdc.service_fee.min_usdc_micro, 0);
  assertEquals(config.usdc.service_fee.max_usdc_micro, 10);
  assertEquals(config.usdc.limits.per_user_daily_usdc_micro, 0);
});

Deno.test("validateDgRedemptionConfigForSave rejects usdc max fee below min", () => {
  try {
    validateDgRedemptionConfigForSave({
      supported_chains: [],
      usdc: { service_fee: { bps: 300, min_usdc_micro: 500_000, max_usdc_micro: 100 } },
    }, []);
    throw new Error("expected validation to fail");
  } catch (error) {
    assertEquals(
      (error as Error).message,
      "Maximum USDC service fee must be greater than or equal to the minimum",
    );
  }
});

Deno.test("calculateUsdcFees clamps service fee between min and max", () => {
  const minClamped = calculateUsdcFees({
    grossValueUsdcMicro: 1_000_000,
    vendorFeeUsdcMicro: 50_000,
    config: DEFAULT_DG_REDEMPTION_CONFIG,
  });
  assertEquals(minClamped.serviceFeeUsdcMicro, 300_000);
  assertEquals(minClamped.totalFeeUsdcMicro, 350_000);
  assertEquals(minClamped.netPayoutUsdcMicro, 700_000);

  const maxClamped = calculateUsdcFees({
    grossValueUsdcMicro: 10_000_000_000,
    vendorFeeUsdcMicro: 0,
    config: DEFAULT_DG_REDEMPTION_CONFIG,
  });
  assertEquals(maxClamped.serviceFeeUsdcMicro, 10_000_000);
  assertEquals(maxClamped.netPayoutUsdcMicro, 9_990_000_000);
});

Deno.test("publicDgRedemptionIntent maps usdc payout fields", () => {
  const intent = {
    id: "intent-1",
    status: "payout_processing",
    payout_method: "usdc",
    chain_id: 84532,
    wallet_address: "0x1111111111111111111111111111111111111111",
    redemption_wallet_address: "0x2222222222222222222222222222222222222222",
    amount_dg_raw: "1000000000000000000",
    vendor_snapshot: { dg_decimals: 18 },
    fee_breakdown: { vendor_fee_usdc_micro: 25_000, pre_vendor_value_usdc_micro: 5_025_000 },
    limits_snapshot: { required_confirmations: 2 },
    gross_usdc_micro: 5_000_000,
    service_fee_usdc_micro: 300_000,
    total_fee_usdc_micro: 325_000,
    net_payout_usdc_micro: 4_700_000,
    payout_wallet_address: "0x3333333333333333333333333333333333333333",
    payout_tx_hash: "0xabc",
    fee_transfer_status: "processing",
    fee_transfer_tx_hash: "0xfee",
    fee_transfer_last_error: null,
    fee_transfer_completed_at: null,
  };

  const view = publicDgRedemptionIntent(intent);
  assertEquals(view.payout_method, "usdc");
  assertEquals(view.gross_value_usdc_micro, 5_000_000);
  assertEquals(view.estimated_receive_usdc_micro, 4_700_000);
  assertEquals(view.vendor_fee_usdc_micro, 25_000);
  assertEquals(view.payout_wallet_address, "0x3333333333333333333333333333333333333333");
  assertEquals(view.payout_tx_hash, "0xabc");
  assertEquals(view.fee_transfer_status, "processing");
  assertEquals(view.fee_transfer_tx_hash, "0xfee");

  const ngnView = publicDgRedemptionIntent({ ...intent, payout_method: undefined });
  assertEquals(ngnView.payout_method, "ngn");
});

Deno.test("isDgRedemptionManuallyPayable handles usdc payout state", () => {
  const base = {
    tx_hash: "0xdeposit",
    status: "manual_review",
    payout_method: "usdc",
  };

  assertEquals(isDgRedemptionManuallyPayable({ ...base }), true);
  assertEquals(isDgRedemptionManuallyPayable({ ...base, payout_tx_hash: "0xpayout" }), false);
  assertEquals(
    isDgRedemptionManuallyPayable({ ...base, payout_tx_hash: "0xpayout", last_error: "usdc_payout_reverted" }),
    true,
  );
  assertEquals(isDgRedemptionManuallyPayable({ ...base, status: "completed" }), false);
});
