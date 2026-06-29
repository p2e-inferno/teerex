import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canApplyPaystackTransferStatus,
  calculateFees,
  DEFAULT_DG_REDEMPTION_CONFIG,
  mapPaystackTransferStatus,
  normalizeDgRedemptionConfig,
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
