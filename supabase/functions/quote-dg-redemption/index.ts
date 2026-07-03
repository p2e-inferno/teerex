/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { getPaystackBalances } from "../_shared/paystack.ts";
import {
  assertRedemptionEnabled,
  calculateFees,
  calculateUsdcFees,
  type DgRedemptionPayoutMethod,
  getNgnBalanceKobo,
  getRedemptionWallet,
  getVendorRedemptionQuote,
  loadDgRedemptionConfig,
  parseReferenceId,
  priceDgRedemptionAmounts,
  priceDgRedemptionAmountsUsdc,
  publicPayoutAccount,
  validateAmountAgainstConfig,
  withRedemptionPricingDefaults,
} from "../_shared/dg-redemption.ts";
import { getUsdcPayoutAvailability, requireUsdcTokenAddress } from "../_shared/dg-redemption-payout.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function friendlyError(message: string): string {
  if (message.includes("user_daily_limit_exceeded")) {
    return "You have reached today's Redeem DG limit";
  }
  if (message.includes("platform_daily_limit_exceeded")) {
    return "Redeem DG daily platform limit has been reached";
  }
  if (message.includes("payout_wallet_liquidity_exceeded")) {
    return "Redeem DG amount is above current payout availability";
  }
  return message;
}

type DailyUsageRow = {
  gross_ngn_kobo?: number | string | null;
  gross_usdc_micro?: number | string | null;
  status: string | null;
  expires_at: string | null;
};

function countsTowardDailyLimit(row: Pick<DailyUsageRow, "status" | "expires_at">, nowMs = Date.now()): boolean {
  const status = String(row.status || "");
  if (status === "expired" || status === "cancelled" || status === "failed") {
    return false;
  }
  if (status === "awaiting_transfer" || status === "validating_transfer") {
    const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : NaN;
    return !Number.isFinite(expiresAtMs) || expiresAtMs > nowMs;
  }
  return true;
}

function sumActiveGross(rows: DailyUsageRow[] | null | undefined, field: "gross_ngn_kobo" | "gross_usdc_micro"): number {
  const nowMs = Date.now();
  return (rows || [])
    .filter((row) => countsTowardDailyLimit(row, nowMs))
    .reduce((total, row) => total + Number(row[field] || 0), 0);
}

async function fetchDailyUsage(params: {
  supabase: any;
  payoutMethod: DgRedemptionPayoutMethod;
  userId: string;
  userLimit: number;
  platformLimit: number;
}): Promise<{ userUsed: number; platformUsed: number }> {
  const field = params.payoutMethod === "usdc" ? "gross_usdc_micro" : "gross_ngn_kobo";
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const baseQuery = () =>
    params.supabase
      .from("dg_redemption_intents")
      .select(`${field},status,expires_at`)
      .eq("payout_method", params.payoutMethod)
      .gte("created_at", dayStart.toISOString())
      .not("status", "in", "(expired,cancelled,failed)");

  const [userUsage, platformUsage] = await Promise.all([
    params.userLimit > 0 ? baseQuery().eq("user_id", params.userId) : Promise.resolve({ data: [], error: null }),
    params.platformLimit > 0 ? baseQuery() : Promise.resolve({ data: [], error: null }),
  ]);
  if (userUsage.error) throw new Error(userUsage.error.message);
  if (platformUsage.error) throw new Error(platformUsage.error.message);

  return {
    userUsed: sumActiveGross(userUsage.data as DailyUsageRow[], field),
    platformUsed: sumActiveGross(platformUsage.data as DailyUsageRow[], field),
  };
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
    const chainId = Number(body.chain_id ?? body.chainId);
    const amountDg = String(body.amount_dg ?? body.amountDg ?? "").trim();
    const previewOnly = Boolean(body.preview_only ?? body.previewOnly ?? false);
    const payoutMethod: DgRedemptionPayoutMethod =
      String(body.payout_method ?? body.payoutMethod ?? "ngn") === "usdc" ? "usdc" : "ngn";
    const walletAddress = await validateUserWallet(userId, String(body.wallet_address || body.walletAddress || ""));

    if (!Number.isInteger(chainId) || chainId <= 0) {
      return json({ ok: false, error: "Invalid network" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [config, network] = await Promise.all([
      loadDgRedemptionConfig(supabase),
      validateChain(supabase, chainId),
    ]);

    if (!network) {
      return json({ ok: false, error: "Network not found or inactive" }, 404);
    }

    assertRedemptionEnabled(config, chainId, payoutMethod);
    validateAmountAgainstConfig({ amountDg, config });

    const pricingNetwork = withRedemptionPricingDefaults(network);
    const redemptionWallet = getRedemptionWallet(config, chainId);

    if (payoutMethod === "usdc") {
      const requestedPayoutWallet = String(
        body.payout_wallet_address || body.payoutWalletAddress || walletAddress,
      );
      const payoutWalletAddress = await validateUserWallet(
        userId,
        requestedPayoutWallet,
        "The payout wallet must be linked to your account",
      );
      const usdcTokenAddress = requireUsdcTokenAddress(pricingNetwork);

      const vendorQuote = await getVendorRedemptionQuote({
        network: pricingNetwork,
        walletAddress,
        amountDg,
        enforceWalletBalance: false,
      });

      const pricing = await priceDgRedemptionAmountsUsdc(
        pricingNetwork,
        {
          gross: vendorQuote.amountDgRaw,
          after_vendor: vendorQuote.netDgRaw,
        },
        vendorQuote.dgDecimals,
      );
      const preVendorValueUsdcMicro = pricing.amounts.gross;
      const grossValueUsdcMicro = pricing.amounts.after_vendor;
      const vendorFeeUsdcMicro = Math.max(preVendorValueUsdcMicro - grossValueUsdcMicro, 0);
      const fees = calculateUsdcFees({
        grossValueUsdcMicro,
        vendorFeeUsdcMicro,
        config,
      });

      const baseUnavailablePayload = {
        ok: true,
        can_redeem: false,
        payout_wallet_address: payoutWalletAddress,
        quote: {
          payout_method: payoutMethod,
          amount_dg: amountDg,
          pre_vendor_value_usdc_micro: preVendorValueUsdcMicro,
          gross_value_usdc_micro: grossValueUsdcMicro,
          estimated_receive_usdc_micro: fees.netPayoutUsdcMicro,
          service_fee_usdc_micro: fees.serviceFeeUsdcMicro,
          vendor_fee_usdc_micro: vendorFeeUsdcMicro,
          total_fee_usdc_micro: fees.totalFeeUsdcMicro,
        },
      };

      if (vendorQuote.amountDgRaw > vendorQuote.dgBalanceRaw) {
        return json({
          ...baseUnavailablePayload,
          error: "Your DG balance is not enough for this redemption",
          max_redeemable: {
            amount_dg: ethers.formatUnits(vendorQuote.dgBalanceRaw, vendorQuote.dgDecimals),
            reason: "wallet_balance",
          },
        });
      }

      if (vendorQuote.liquidityExceeded) {
        const feeDenominator = BigInt(Math.max(10_000 - vendorQuote.sellFeeBps, 1));
        const maxDgRaw = (vendorQuote.upBalanceRaw * vendorQuote.exchangeRate * 10_000n) / feeDenominator;
        return json({
          ...baseUnavailablePayload,
          error: "Redeem DG amount is above current platform liquidity",
          max_redeemable: {
            amount_dg: ethers.formatUnits(maxDgRaw, vendorQuote.dgDecimals),
            reason: "platform_liquidity",
          },
        });
      }

      if (config.usdc.limits.min_gross_usdc_micro > 0 && grossValueUsdcMicro < config.usdc.limits.min_gross_usdc_micro) {
        return json({
          ...baseUnavailablePayload,
          error: "Redeem DG amount is below the current minimum payout value",
          minimum_gross_value_usdc_micro: config.usdc.limits.min_gross_usdc_micro,
        });
      }

      const usage = await fetchDailyUsage({
        supabase,
        payoutMethod,
        userId,
        userLimit: config.usdc.limits.per_user_daily_usdc_micro,
        platformLimit: config.usdc.limits.platform_daily_usdc_micro,
      });
      const userDailyLeftMicro = config.usdc.limits.per_user_daily_usdc_micro > 0
        ? Math.max(config.usdc.limits.per_user_daily_usdc_micro - usage.userUsed, 0)
        : null;
      if (userDailyLeftMicro !== null && grossValueUsdcMicro > userDailyLeftMicro) {
        return json({
          ...baseUnavailablePayload,
          error: "You have reached today's Redeem DG limit",
          max_redeemable: {
            gross_value_usdc_micro: userDailyLeftMicro,
            reason: "user_daily_limit",
          },
        });
      }
      const platformDailyLeftMicro = config.usdc.limits.platform_daily_usdc_micro > 0
        ? Math.max(config.usdc.limits.platform_daily_usdc_micro - usage.platformUsed, 0)
        : null;
      if (platformDailyLeftMicro !== null && grossValueUsdcMicro > platformDailyLeftMicro) {
        return json({
          ...baseUnavailablePayload,
          error: "Redeem DG daily platform limit has been reached",
          max_redeemable: {
            gross_value_usdc_micro: platformDailyLeftMicro,
            reason: "platform_daily_limit",
          },
        });
      }

      let payoutWalletBalanceMicro: number | null = null;
      if (config.usdc.balance_cap_enabled) {
        const availability = await getUsdcPayoutAvailability({ supabase, network: pricingNetwork });
        payoutWalletBalanceMicro = availability.usdcBalanceMicro;
        const requiredWalletMicro = fees.netPayoutUsdcMicro + fees.serviceFeeUsdcMicro;
        if (requiredWalletMicro > availability.availableMicro) {
          return json({
            ...baseUnavailablePayload,
            error: "Redeem DG amount is above current payout availability",
            max_redeemable: {
              net_payout_usdc_micro: Math.max(availability.availableMicro - fees.serviceFeeUsdcMicro, 0),
              reason: "payout_wallet_balance",
            },
          });
        }
      }

      if (fees.netPayoutUsdcMicro <= 0) {
        return json({ ok: false, error: "Redeem DG amount is too small after fees" }, 400);
      }

      const quotePayload = {
        payout_method: payoutMethod,
        chain_id: chainId,
        redemption_wallet_address: redemptionWallet,
        payout_wallet_address: payoutWalletAddress,
        amount_dg: amountDg,
        amount_dg_raw: vendorQuote.amountDgRaw.toString(),
        pre_vendor_value_usdc_micro: preVendorValueUsdcMicro,
        gross_value_usdc_micro: grossValueUsdcMicro,
        estimated_receive_usdc_micro: fees.netPayoutUsdcMicro,
        service_fee_usdc_micro: fees.serviceFeeUsdcMicro,
        vendor_fee_usdc_micro: vendorFeeUsdcMicro,
        total_fee_usdc_micro: fees.totalFeeUsdcMicro,
        vendor_conversion_fee_bps: vendorQuote.sellFeeBps,
        required_confirmations: config.required_confirmations,
      };

      if (previewOnly) {
        return json({
          ok: true,
          can_redeem: true,
          payout_wallet_address: payoutWalletAddress,
          quote: { intent_id: null, expires_at: null, ...quotePayload },
        });
      }

      const expiresAt = new Date(Date.now() + config.quote_ttl_seconds * 1000).toISOString();
      const { data: intent, error: intentError } = await supabase.rpc("create_dg_redemption_intent", {
        p_user_id: userId,
        p_wallet_address: walletAddress,
        p_chain_id: chainId,
        p_payout_account_id: null,
        p_dg_token_address: pricingNetwork.dg_token_address,
        p_up_token_address: pricingNetwork.up_token_address,
        p_vendor_address: pricingNetwork.dg_vendor_address,
        p_redemption_wallet_address: redemptionWallet,
        p_amount_dg_raw: vendorQuote.amountDgRaw.toString(),
        p_vendor_fee_dg_raw: vendorQuote.vendorFeeDgRaw.toString(),
        p_net_dg_raw: vendorQuote.netDgRaw.toString(),
        p_estimated_up_out_raw: vendorQuote.estimatedUpOutRaw.toString(),
        p_gross_ngn_kobo: 0,
        p_service_fee_kobo: 0,
        p_vat_kobo: 0,
        p_vat_rate_bps: 0,
        p_vat_basis: "none",
        p_vat_basis_kobo: 0,
        p_total_fee_kobo: 0,
        p_net_payout_kobo: 0,
        p_fee_breakdown: {
          ...fees.feeBreakdown,
          amount_dg: amountDg,
          pre_vendor_value_usdc_micro: preVendorValueUsdcMicro,
          gross_after_vendor_usdc_micro: grossValueUsdcMicro,
        },
        p_vendor_snapshot: vendorQuote.snapshot,
        p_pricing_snapshot: pricing.snapshot,
        p_limits_snapshot: {
          min_dg: config.limits.min_dg,
          max_dg: config.limits.max_dg,
          min_gross_usdc_micro: config.usdc.limits.min_gross_usdc_micro,
          per_user_daily_usdc_micro: config.usdc.limits.per_user_daily_usdc_micro,
          platform_daily_usdc_micro: config.usdc.limits.platform_daily_usdc_micro,
          required_confirmations: config.required_confirmations,
          payout_wallet_balance_micro: payoutWalletBalanceMicro,
          payout_wallet_required_micro: fees.netPayoutUsdcMicro + fees.serviceFeeUsdcMicro,
        },
        p_payout_snapshot: {
          payout_method: payoutMethod,
          payout_wallet_address: payoutWalletAddress,
          payout_token_address: usdcTokenAddress,
        },
        p_paystack_reference: parseReferenceId(),
        p_expires_at: expiresAt,
        p_user_daily_limit_kobo: 0,
        p_platform_daily_limit_kobo: 0,
        p_payout_method: payoutMethod,
        p_payout_wallet_address: payoutWalletAddress,
        p_payout_token_address: usdcTokenAddress,
        p_gross_usdc_micro: grossValueUsdcMicro,
        p_service_fee_usdc_micro: fees.serviceFeeUsdcMicro,
        p_total_fee_usdc_micro: fees.totalFeeUsdcMicro,
        p_net_payout_usdc_micro: fees.netPayoutUsdcMicro,
        p_user_daily_limit_usdc_micro: config.usdc.limits.per_user_daily_usdc_micro,
        p_platform_daily_limit_usdc_micro: config.usdc.limits.platform_daily_usdc_micro,
        // Null when the balance cap is disabled; the RPC re-checks committed liquidity
        // under its advisory lock so concurrent quotes cannot both pass the cap.
        p_payout_wallet_balance_usdc_micro: payoutWalletBalanceMicro,
      });

      if (intentError) throw new Error(friendlyError(intentError.message));

      return json({
        ok: true,
        can_redeem: true,
        payout_wallet_address: payoutWalletAddress,
        quote: { intent_id: intent.id, expires_at: intent.expires_at, ...quotePayload },
      });
    }

    const { data: payoutAccount, error: payoutError } = await supabase
      .from("user_payout_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "paystack")
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payoutError) throw new Error(payoutError.message);
    if (!payoutAccount?.provider_recipient_code) {
      return json({ ok: false, error: "Save your bank account before redeeming DG" }, 400);
    }

    const vendorQuote = await getVendorRedemptionQuote({
      network: pricingNetwork,
      walletAddress,
      amountDg,
      enforceWalletBalance: false,
    });

    const pricing = await priceDgRedemptionAmounts(
      pricingNetwork,
      {
        gross: vendorQuote.amountDgRaw,
        after_vendor: vendorQuote.netDgRaw,
      },
      vendorQuote.dgDecimals,
    );
    const preVendorValueKobo = pricing.amounts.gross;
    const grossValueKobo = pricing.amounts.after_vendor;
    const vendorFeeKobo = Math.max(preVendorValueKobo - grossValueKobo, 0);
    const fees = calculateFees({
      grossValueKobo,
      vendorFeeKobo,
      config,
    });

    const baseUnavailablePayload = {
      ok: true,
      can_redeem: false,
      payout_account: publicPayoutAccount(payoutAccount),
      quote: {
        payout_method: payoutMethod,
        amount_dg: amountDg,
        pre_vendor_value_kobo: preVendorValueKobo,
        gross_value_kobo: grossValueKobo,
        estimated_receive_kobo: fees.netPayoutKobo,
        service_fee_kobo: fees.serviceFeeKobo,
        vendor_fee_kobo: vendorFeeKobo,
        vat_kobo: fees.vatKobo,
        total_fee_kobo: fees.totalFeeKobo,
      },
    };

    if (vendorQuote.amountDgRaw > vendorQuote.dgBalanceRaw) {
      return json({
        ...baseUnavailablePayload,
        error: "Your DG balance is not enough for this redemption",
        max_redeemable: {
          amount_dg: ethers.formatUnits(vendorQuote.dgBalanceRaw, vendorQuote.dgDecimals),
          reason: "wallet_balance",
        },
      });
    }

    if (vendorQuote.liquidityExceeded) {
      const feeDenominator = BigInt(Math.max(10_000 - vendorQuote.sellFeeBps, 1));
      const maxDgRaw = (vendorQuote.upBalanceRaw * vendorQuote.exchangeRate * 10_000n) / feeDenominator;
      return json({
        ...baseUnavailablePayload,
        error: "Redeem DG amount is above current platform liquidity",
        max_redeemable: {
          amount_dg: ethers.formatUnits(maxDgRaw, vendorQuote.dgDecimals),
          reason: "platform_liquidity",
        },
      });
    }

    if (config.limits.min_gross_ngn_kobo > 0 && grossValueKobo < config.limits.min_gross_ngn_kobo) {
      return json({
        ...baseUnavailablePayload,
        error: "Redeem DG amount is below the current minimum payout value",
        minimum_gross_value_kobo: config.limits.min_gross_ngn_kobo,
      });
    }

    const usage = await fetchDailyUsage({
      supabase,
      payoutMethod,
      userId,
      userLimit: config.limits.per_user_daily_ngn_kobo,
      platformLimit: config.limits.platform_daily_ngn_kobo,
    });
    const userDailyLeftKobo = config.limits.per_user_daily_ngn_kobo > 0
      ? Math.max(config.limits.per_user_daily_ngn_kobo - usage.userUsed, 0)
      : null;
    if (userDailyLeftKobo !== null && grossValueKobo > userDailyLeftKobo) {
      return json({
        ...baseUnavailablePayload,
        error: "You have reached today's Redeem DG limit",
        max_redeemable: {
          gross_value_kobo: userDailyLeftKobo,
          reason: "user_daily_limit",
        },
      });
    }
    const platformDailyLeftKobo = config.limits.platform_daily_ngn_kobo > 0
      ? Math.max(config.limits.platform_daily_ngn_kobo - usage.platformUsed, 0)
      : null;
    if (platformDailyLeftKobo !== null && grossValueKobo > platformDailyLeftKobo) {
      return json({
        ...baseUnavailablePayload,
        error: "Redeem DG daily platform limit has been reached",
        max_redeemable: {
          gross_value_kobo: platformDailyLeftKobo,
          reason: "platform_daily_limit",
        },
      });
    }

    let paystackBalanceKobo: number | null = null;
    if (config.paystack_balance_cap_enabled) {
      paystackBalanceKobo = getNgnBalanceKobo(await getPaystackBalances());
      if (paystackBalanceKobo !== null && fees.netPayoutKobo > paystackBalanceKobo) {
        return json({
          ...baseUnavailablePayload,
          error: "Redeem DG amount is above current payout availability",
          max_redeemable: {
            net_payout_kobo: paystackBalanceKobo,
            reason: "paystack_balance",
          },
        });
      }
    }

    if (fees.netPayoutKobo <= 0) {
      return json({ ok: false, error: "Redeem DG amount is too small after fees" }, 400);
    }

    if (previewOnly) {
      return json({
        ok: true,
        can_redeem: true,
        payout_account: publicPayoutAccount(payoutAccount),
        quote: {
          intent_id: null,
          expires_at: null,
          payout_method: payoutMethod,
          chain_id: chainId,
          redemption_wallet_address: redemptionWallet,
          amount_dg: amountDg,
          amount_dg_raw: vendorQuote.amountDgRaw.toString(),
          pre_vendor_value_kobo: preVendorValueKobo,
          gross_value_kobo: grossValueKobo,
          estimated_receive_kobo: fees.netPayoutKobo,
          service_fee_kobo: fees.serviceFeeKobo,
          vendor_fee_kobo: vendorFeeKobo,
          vat_kobo: fees.vatKobo,
          total_fee_kobo: fees.totalFeeKobo,
          vendor_conversion_fee_bps: vendorQuote.sellFeeBps,
          required_confirmations: config.required_confirmations,
        },
      });
    }

    const expiresAt = new Date(Date.now() + config.quote_ttl_seconds * 1000).toISOString();
    const paystackReference = parseReferenceId();
    const { data: intent, error: intentError } = await supabase.rpc("create_dg_redemption_intent", {
      p_user_id: userId,
      p_wallet_address: walletAddress,
      p_chain_id: chainId,
      p_payout_account_id: payoutAccount.id,
      p_dg_token_address: pricingNetwork.dg_token_address,
      p_up_token_address: pricingNetwork.up_token_address,
      p_vendor_address: pricingNetwork.dg_vendor_address,
      p_redemption_wallet_address: redemptionWallet,
      p_amount_dg_raw: vendorQuote.amountDgRaw.toString(),
      p_vendor_fee_dg_raw: vendorQuote.vendorFeeDgRaw.toString(),
      p_net_dg_raw: vendorQuote.netDgRaw.toString(),
      p_estimated_up_out_raw: vendorQuote.estimatedUpOutRaw.toString(),
      p_gross_ngn_kobo: grossValueKobo,
      p_service_fee_kobo: fees.serviceFeeKobo,
      p_vat_kobo: fees.vatKobo,
      p_vat_rate_bps: config.tax.enabled ? config.tax.vat_bps : 0,
      p_vat_basis: config.tax.enabled ? config.tax.basis : "none",
      p_vat_basis_kobo: fees.vatBasisKobo,
      p_total_fee_kobo: fees.totalFeeKobo,
      p_net_payout_kobo: fees.netPayoutKobo,
      p_fee_breakdown: {
        ...fees.feeBreakdown,
        amount_dg: amountDg,
        pre_vendor_value_kobo: preVendorValueKobo,
        gross_after_vendor_kobo: grossValueKobo,
      },
      p_vendor_snapshot: vendorQuote.snapshot,
      p_pricing_snapshot: pricing.snapshot,
      p_limits_snapshot: {
        min_dg: config.limits.min_dg,
        max_dg: config.limits.max_dg,
        min_gross_ngn_kobo: config.limits.min_gross_ngn_kobo,
        per_user_daily_ngn_kobo: config.limits.per_user_daily_ngn_kobo,
        platform_daily_ngn_kobo: config.limits.platform_daily_ngn_kobo,
        required_confirmations: config.required_confirmations,
        paystack_balance_kobo: paystackBalanceKobo,
      },
      p_payout_snapshot: publicPayoutAccount(payoutAccount),
      p_paystack_reference: paystackReference,
      p_expires_at: expiresAt,
      p_user_daily_limit_kobo: config.limits.per_user_daily_ngn_kobo,
      p_platform_daily_limit_kobo: config.limits.platform_daily_ngn_kobo,
    });

    if (intentError) throw new Error(friendlyError(intentError.message));

    return json({
      ok: true,
      can_redeem: true,
      payout_account: publicPayoutAccount(payoutAccount),
      quote: {
        intent_id: intent.id,
        expires_at: intent.expires_at,
        payout_method: payoutMethod,
        chain_id: chainId,
        redemption_wallet_address: redemptionWallet,
        amount_dg: amountDg,
        amount_dg_raw: vendorQuote.amountDgRaw.toString(),
        pre_vendor_value_kobo: preVendorValueKobo,
        gross_value_kobo: grossValueKobo,
        estimated_receive_kobo: fees.netPayoutKobo,
        service_fee_kobo: fees.serviceFeeKobo,
        vendor_fee_kobo: vendorFeeKobo,
        vat_kobo: fees.vatKobo,
        total_fee_kobo: fees.totalFeeKobo,
        vendor_conversion_fee_bps: vendorQuote.sellFeeBps,
        required_confirmations: config.required_confirmations,
      },
    });
  } catch (error) {
    const message = friendlyError(error instanceof Error ? error.message : "Internal error");
    const lower = message.toLowerCase();
    const status = lower.includes("authorization") || lower.includes("token")
      ? 401
      : lower.includes("not found")
      ? 404
      : lower.includes("not available") || lower.includes("invalid") || lower.includes("minimum") || lower.includes("maximum") ||
          lower.includes("save your") || lower.includes("must be linked")
      ? 400
      : lower.includes("availability")
      ? 409
      : 500;
    return json({ ok: false, error: message }, status);
  }
});
