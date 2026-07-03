/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getPaystackBalances } from "../_shared/paystack.ts";
import { getNgnBalanceKobo, loadDgRedemptionConfig, reconcileDgRedemptionPaystackTransfer } from "../_shared/dg-redemption.ts";
import {
  canReconcileUsdcFeeTransfer,
  canReconcileUsdcPayout,
  getDgRedemptionPayoutWallet,
  getUsdcPayoutAvailability,
  reconcileUsdcFeeTransfer,
  reconcileUsdcPayout,
} from "../_shared/dg-redemption-payout.ts";
import { alertIfNewlyManualReview } from "../_shared/dg-redemption-notify.ts";
import { validateChain } from "../_shared/network-helpers.ts";

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function summarize(rows: any[]) {
  const byStatus: Record<string, number> = {};
  let ngnCount = 0;
  let grossKobo = 0;
  let netPayoutKobo = 0;
  let feesKobo = 0;
  let usdcCount = 0;
  let grossUsdcMicro = 0;
  let netPayoutUsdcMicro = 0;
  let feesUsdcMicro = 0;
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    if (String(row.payout_method || "ngn") === "usdc") {
      usdcCount += 1;
      grossUsdcMicro += Number(row.gross_usdc_micro || 0);
      netPayoutUsdcMicro += Number(row.net_payout_usdc_micro || 0);
      feesUsdcMicro += Number(row.total_fee_usdc_micro || 0);
    } else {
      ngnCount += 1;
      grossKobo += Number(row.gross_ngn_kobo || 0);
      netPayoutKobo += Number(row.net_payout_kobo || 0);
      feesKobo += Number(row.total_fee_kobo || 0);
    }
  }
  return {
    count: rows.length,
    by_status: byStatus,
    gross_kobo: grossKobo,
    net_payout_kobo: netPayoutKobo,
    fees_kobo: feesKobo,
    ngn: { count: ngnCount, gross_kobo: grossKobo, net_payout_kobo: netPayoutKobo, fees_kobo: feesKobo },
    usdc: {
      count: usdcCount,
      gross_usdc_micro: grossUsdcMicro,
      net_payout_usdc_micro: netPayoutUsdcMicro,
      fees_usdc_micro: feesUsdcMicro,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
    await ensureAdmin(req.headers);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [config, recentResult, dailyResult, balancesResult] = await Promise.all([
      loadDgRedemptionConfig(supabase),
      supabase
        .from("dg_redemption_intents")
        .select("id,user_id,wallet_address,redemption_wallet_address,chain_id,status,payout_method,amount_dg_raw,gross_ngn_kobo,service_fee_kobo,vat_kobo,total_fee_kobo,net_payout_kobo,gross_usdc_micro,service_fee_usdc_micro,total_fee_usdc_micro,net_payout_usdc_micro,payout_wallet_address,payout_tx_hash,fee_transfer_status,fee_transfer_tx_hash,fee_transfer_last_error,fee_transfer_completed_at,tx_hash,paystack_reference,paystack_status,paystack_transfer_code,paystack_transfer_id,last_error,expires_at,created_at,updated_at,completed_at,payout_account:user_payout_accounts(id,account_holder_name,bank_name,account_number_last4,status)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("dg_redemption_intents")
        .select("id,status,payout_method,gross_ngn_kobo,total_fee_kobo,net_payout_kobo,gross_usdc_micro,total_fee_usdc_micro,net_payout_usdc_micro")
        .gte("created_at", since24h),
      getPaystackBalances().then((balances) => ({ balances, error: null })).catch((error) => ({ balances: [], error })),
    ]);

    if (recentResult.error) throw new Error(recentResult.error.message);
    if (dailyResult.error) throw new Error(dailyResult.error.message);

    const networkCache = new Map<number, Promise<any>>();
    const getNetwork = (chainId: number) => {
      if (!networkCache.has(chainId)) {
        networkCache.set(chainId, validateChain(supabase, chainId));
      }
      return networkCache.get(chainId)!;
    };

    const recentRedemptions = await Promise.all(
      (recentResult.data || []).map(async (intent: any) => {
        const reconciled = await reconcileDgRedemptionPaystackTransfer(supabase, intent, {
          failedStatus: "manual_review",
          logPrefix: "get-dg-redemption-admin-dashboard",
        });
        await alertIfNewlyManualReview({
          supabase,
          before: intent,
          after: reconciled,
          reason: reconciled.last_error || "paystack_transfer_failed",
          logPrefix: "get-dg-redemption-admin-dashboard",
        });
        let next = reconciled;
        if (canReconcileUsdcPayout(next)) {
          const network = await getNetwork(Number(next.chain_id));
          if (network) {
            next = await reconcileUsdcPayout({
              supabase,
              intent: next,
              network,
              requiredConfirmations: config.required_confirmations,
              logPrefix: "get-dg-redemption-admin-dashboard",
            });
          }
        }
        if (!canReconcileUsdcFeeTransfer(next)) return next;
        const network = await getNetwork(Number(next.chain_id));
        if (!network) return next;
        return reconcileUsdcFeeTransfer({
          supabase,
          intent: next,
          network,
          requiredConfirmations: config.required_confirmations,
          logPrefix: "get-dg-redemption-admin-dashboard",
        });
      }),
    );
    const recentById = new Map(recentRedemptions.map((row: any) => [row.id, row]));
    const dailyRows = (dailyResult.data || []).map((row: any) => recentById.get(row.id) || row);

    const payoutWallets = await Promise.all(config.supported_chains.map(async (chainId) => {
      try {
        const network = await getNetwork(chainId);
        if (!network) throw new Error("Network not found or inactive");
        const availability = await getUsdcPayoutAvailability({ supabase, network });
        const wallet = getDgRedemptionPayoutWallet(network);
        const nativeWei = await wallet.provider!.getBalance(wallet.address);
        return {
          chain_id: chainId,
          address: availability.payoutWalletAddress,
          usdc_balance_micro: availability.usdcBalanceMicro,
          committed_usdc_micro: availability.committedMicro,
          available_usdc_micro: availability.availableMicro,
          native_balance_wei: nativeWei.toString(),
          error: null,
        };
      } catch (error) {
        return {
          chain_id: chainId,
          address: null,
          usdc_balance_micro: null,
          committed_usdc_micro: null,
          available_usdc_micro: null,
          native_balance_wei: null,
          error: error instanceof Error ? error.message : "Could not fetch payout wallet balance",
        };
      }
    }));

    const balances = balancesResult.balances as Array<{ currency: string; balance: number }>;
    return json({
      ok: true,
      config,
      provider_health: {
        paystack_balance_kobo: getNgnBalanceKobo(balances),
        balances,
        payout_wallets: payoutWallets,
        error: balancesResult.error instanceof Error ? balancesResult.error.message : null,
      },
      summary_24h: summarize(dailyRows),
      recent_redemptions: recentRedemptions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = message.includes("unauthorized") ? 403 : message.includes("authorization") ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});
