/* deno-lint-ignore-file no-explicit-any */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { Contract, JsonRpcProvider, ethers } from "https://esm.sh/ethers@6.14.4";
import type { NetworkConfig } from "./network-helpers.ts";
import { getPaystackBalances, verifyPaystackTransfer, type PaystackTransferData } from "./paystack.ts";
import { withBaseMainnetPricingDefaults } from "./pricing/base-defaults.ts";
import { fetchFiatEdges } from "./pricing/sources/fiat.ts";
import { normalizeUniswapQuotesToEdges } from "./pricing/sources/uniswap.ts";
import { normalizeVendorRateToEdges } from "./pricing/sources/vendor.ts";
import { convertAmount, getPricingSnapshot } from "./pricing/service.ts";
import { withPricingProviderFallback } from "./pricing/rpc.ts";
import type { RateEdge, SupportedSymbol } from "./pricing/types.ts";

export const DG_REDEMPTION_CONFIG_KEY = "dg_redemption_config";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
];

const DG_VENDOR_ABI = [
  "function getExchangeRate() view returns (uint256)",
  "function getFeeConfig() view returns (uint256 maxFeeBps,uint256 minFeeBps,uint256 buyFeeBps,uint256 sellFeeBps,uint256 rateChangeCooldown,uint256 appChangeCooldown)",
  "function getTokenConfig() view returns (address baseToken,address swapToken,uint256 exchangeRate)",
  "function paused() view returns (bool)",
];

const UNISWAP_V3_POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
];

const UNISWAP_QUOTER_V2_ABI = [
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
];

export interface DgRedemptionConfig {
  enabled: boolean;
  supported_chains: number[];
  wallets_by_chain: Record<string, string>;
  quote_ttl_seconds: number;
  required_confirmations: number;
  paystack_balance_cap_enabled: boolean;
  limits: {
    min_dg: string;
    max_dg: string;
    min_gross_ngn_kobo: number;
    per_user_daily_ngn_kobo: number;
    platform_daily_ngn_kobo: number;
    manual_review_ngn_kobo: number;
  };
  service_fee: {
    bps: number;
    min_kobo: number;
    max_kobo: number;
  };
  tax: {
    enabled: boolean;
    vat_bps: number;
    basis: "service_fee" | "none";
  };
}

export interface FeeCalculation {
  serviceFeeKobo: number;
  vatKobo: number;
  vatBasisKobo: number;
  totalFeeKobo: number;
  netPayoutKobo: number;
  feeBreakdown: Record<string, unknown>;
}

export type DgRedemptionIntentStatus =
  | "awaiting_transfer"
  | "validating_transfer"
  | "payout_pending"
  | "payout_processing"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed"
  | "manual_review";

export interface DgRedemptionDiagnostics {
  paystack_balance: {
    available_kobo: number | null;
    status: "ok" | "disabled" | "error";
    error?: string;
  };
  chains: Array<{
    chain_id: number;
    chain_name: string;
    supported: boolean;
    redemption_wallet_address: string | null;
    dg_token_address: string | null;
    up_token_address: string | null;
    vendor_address: string | null;
    token_config_matches: boolean | null;
    paused: boolean | null;
    exchange_rate: string | null;
    sell_fee_bps: number | null;
    vendor_up_balance_raw: string | null;
    vendor_up_balance_decimals: number | null;
    status: "ok" | "warning" | "error";
    error?: string;
  }>;
}

export interface VendorRedemptionQuote {
  amountDgRaw: bigint;
  vendorFeeDgRaw: bigint;
  netDgRaw: bigint;
  preVendorUpOutRaw: bigint;
  estimatedUpOutRaw: bigint;
  vendorFeeUpRaw: bigint;
  upBalanceRaw: bigint;
  dgBalanceRaw: bigint;
  dgDecimals: number;
  upDecimals: number;
  exchangeRate: bigint;
  sellFeeBps: number;
  liquidityExceeded: boolean;
  tokenConfig: {
    baseToken: string;
    swapToken: string;
  };
  snapshot: Record<string, unknown>;
}

export const DEFAULT_DG_REDEMPTION_CONFIG: DgRedemptionConfig = {
  enabled: false,
  supported_chains: [],
  wallets_by_chain: {},
  quote_ttl_seconds: 900,
  required_confirmations: 2,
  paystack_balance_cap_enabled: true,
  limits: {
    min_dg: "1",
    max_dg: "100000",
    min_gross_ngn_kobo: 0,
    per_user_daily_ngn_kobo: 50_000_000,
    platform_daily_ngn_kobo: 500_000_000,
    manual_review_ngn_kobo: 25_000_000,
  },
  service_fee: {
    bps: 300,
    min_kobo: 50_000,
    max_kobo: 1_500_000,
  },
  tax: {
    enabled: false,
    vat_bps: 750,
    basis: "service_fee",
  },
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asInteger(value: unknown, fallback: number): number {
  const parsed = Math.trunc(asNumber(value, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = asInteger(value, fallback);
  return Math.min(Math.max(parsed, min), max);
}

function positiveAmountString(value: unknown, fallback: string): string {
  const text = String(value ?? fallback).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return fallback;
  return Number(text) > 0 ? text : fallback;
}

export function normalizeDgRedemptionConfig(input: unknown): DgRedemptionConfig {
  const base = DEFAULT_DG_REDEMPTION_CONFIG;
  const raw = asObject(input);
  const limits = asObject(raw.limits);
  const serviceFee = asObject(raw.service_fee);
  const tax = asObject(raw.tax);
  const wallets = asObject(raw.wallets_by_chain);
  const normalizedWallets: Record<string, string> = {};
  for (const [chainId, address] of Object.entries(wallets)) {
    const key = String(chainId).trim();
    const value = String(address || "").trim().toLowerCase();
    if (/^\d+$/.test(key) && ethers.isAddress(value)) {
      normalizedWallets[key] = value;
    }
  }

  return {
    enabled: Boolean(raw.enabled),
    supported_chains: Array.isArray(raw.supported_chains)
      ? raw.supported_chains.map((chain) => Number(chain)).filter((chain) => Number.isInteger(chain) && chain > 0)
      : [...base.supported_chains],
    wallets_by_chain: normalizedWallets,
    quote_ttl_seconds: clampInteger(raw.quote_ttl_seconds, base.quote_ttl_seconds, 60, 3600),
    required_confirmations: clampInteger(raw.required_confirmations, base.required_confirmations, 0, 60),
    paystack_balance_cap_enabled: raw.paystack_balance_cap_enabled !== undefined
      ? Boolean(raw.paystack_balance_cap_enabled)
      : base.paystack_balance_cap_enabled,
    limits: {
      min_dg: positiveAmountString(limits.min_dg, base.limits.min_dg),
      max_dg: positiveAmountString(limits.max_dg, base.limits.max_dg),
      min_gross_ngn_kobo: clampInteger(
        limits.min_gross_ngn_kobo,
        base.limits.min_gross_ngn_kobo,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      per_user_daily_ngn_kobo: clampInteger(
        limits.per_user_daily_ngn_kobo,
        base.limits.per_user_daily_ngn_kobo,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      platform_daily_ngn_kobo: clampInteger(
        limits.platform_daily_ngn_kobo,
        base.limits.platform_daily_ngn_kobo,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      manual_review_ngn_kobo: clampInteger(
        limits.manual_review_ngn_kobo,
        base.limits.manual_review_ngn_kobo,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    },
    service_fee: {
      bps: clampInteger(serviceFee.bps, base.service_fee.bps, 0, 10_000),
      min_kobo: clampInteger(serviceFee.min_kobo, base.service_fee.min_kobo, 0, Number.MAX_SAFE_INTEGER),
      max_kobo: Math.max(
        clampInteger(serviceFee.max_kobo, base.service_fee.max_kobo, 0, Number.MAX_SAFE_INTEGER),
        clampInteger(serviceFee.min_kobo, base.service_fee.min_kobo, 0, Number.MAX_SAFE_INTEGER),
      ),
    },
    tax: {
      enabled: Boolean(tax.enabled),
      vat_bps: clampInteger(tax.vat_bps, base.tax.vat_bps, 0, 10_000),
      basis: tax.basis === "service_fee" ? "service_fee" : "none",
    },
  };
}

function requireIntegerInRange(value: unknown, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function requireAmountString(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text) || Number(text) <= 0) {
    throw new Error(`${label} must be a positive amount`);
  }
  return text;
}

export function validateDgRedemptionConfigForSave(
  input: unknown,
  activeNetworks: NetworkConfig[],
): DgRedemptionConfig {
  const raw = asObject(input);
  const limits = asObject(raw.limits);
  const serviceFee = asObject(raw.service_fee);
  const tax = asObject(raw.tax);
  const wallets = asObject(raw.wallets_by_chain);
  const activeChainIds = new Set(activeNetworks.map((network) => Number(network.chain_id)));
  const supportedChains = Array.isArray(raw.supported_chains)
    ? raw.supported_chains.map((chain) => Number(chain))
    : [];

  if (!supportedChains.every((chain) => Number.isInteger(chain) && chain > 0)) {
    throw new Error("Supported chains must be valid chain ids");
  }
  for (const chainId of supportedChains) {
    if (!activeChainIds.has(chainId)) {
      throw new Error(`Chain ${chainId} is not an active supported network`);
    }
    const wallet = String(wallets[String(chainId)] || "").trim();
    if (!ethers.isAddress(wallet)) {
      throw new Error(`Redemption wallet is required for chain ${chainId}`);
    }
  }

  const minDg = requireAmountString(limits.min_dg ?? DEFAULT_DG_REDEMPTION_CONFIG.limits.min_dg, "Minimum DG amount");
  const maxDg = requireAmountString(limits.max_dg ?? DEFAULT_DG_REDEMPTION_CONFIG.limits.max_dg, "Maximum DG amount");
  if (Number(maxDg) < Number(minDg)) {
    throw new Error("Maximum DG amount must be greater than or equal to the minimum");
  }

  const serviceMinKobo = requireIntegerInRange(
    serviceFee.min_kobo ?? DEFAULT_DG_REDEMPTION_CONFIG.service_fee.min_kobo,
    "Minimum service fee",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const serviceMaxKobo = requireIntegerInRange(
    serviceFee.max_kobo ?? DEFAULT_DG_REDEMPTION_CONFIG.service_fee.max_kobo,
    "Maximum service fee",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (serviceMaxKobo < serviceMinKobo) {
    throw new Error("Maximum service fee must be greater than or equal to the minimum");
  }

  const basis = tax.basis ?? DEFAULT_DG_REDEMPTION_CONFIG.tax.basis;
  if (!["service_fee", "none"].includes(String(basis))) {
    throw new Error("VAT basis must be service_fee or none");
  }

  return {
    ...normalizeDgRedemptionConfig(raw),
    supported_chains: [...new Set(supportedChains)],
    wallets_by_chain: Object.fromEntries(
      Object.entries(wallets)
        .filter(([chainId]) => supportedChains.includes(Number(chainId)))
        .map(([chainId, wallet]) => [String(chainId), String(wallet).trim().toLowerCase()]),
    ),
    limits: {
      min_dg: minDg,
      max_dg: maxDg,
      min_gross_ngn_kobo: requireIntegerInRange(
        limits.min_gross_ngn_kobo ?? DEFAULT_DG_REDEMPTION_CONFIG.limits.min_gross_ngn_kobo,
        "Minimum gross NGN value",
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      per_user_daily_ngn_kobo: requireIntegerInRange(
        limits.per_user_daily_ngn_kobo ?? DEFAULT_DG_REDEMPTION_CONFIG.limits.per_user_daily_ngn_kobo,
        "Per-user daily Redeem DG limit",
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      platform_daily_ngn_kobo: requireIntegerInRange(
        limits.platform_daily_ngn_kobo ?? DEFAULT_DG_REDEMPTION_CONFIG.limits.platform_daily_ngn_kobo,
        "Platform daily Redeem DG limit",
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      manual_review_ngn_kobo: requireIntegerInRange(
        limits.manual_review_ngn_kobo ?? DEFAULT_DG_REDEMPTION_CONFIG.limits.manual_review_ngn_kobo,
        "Manual review threshold",
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    },
    service_fee: {
      bps: requireIntegerInRange(serviceFee.bps ?? DEFAULT_DG_REDEMPTION_CONFIG.service_fee.bps, "Service fee bps", 0, 10_000),
      min_kobo: serviceMinKobo,
      max_kobo: serviceMaxKobo,
    },
    tax: {
      enabled: Boolean(tax.enabled),
      vat_bps: requireIntegerInRange(tax.vat_bps ?? DEFAULT_DG_REDEMPTION_CONFIG.tax.vat_bps, "VAT bps", 0, 10_000),
      basis: basis === "service_fee" ? "service_fee" : "none",
    },
  };
}

export async function loadDgRedemptionConfig(
  supabase: SupabaseClient,
): Promise<DgRedemptionConfig> {
  const { data, error } = await supabase
    .from("platform_config")
    .select("value")
    .eq("key", DG_REDEMPTION_CONFIG_KEY)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizeDgRedemptionConfig(data?.value);
}

export async function saveDgRedemptionConfig(
  supabase: SupabaseClient,
  config: DgRedemptionConfig,
): Promise<DgRedemptionConfig> {
  const normalized = normalizeDgRedemptionConfig(config);
  const { error } = await supabase
    .from("platform_config")
    .upsert({
      key: DG_REDEMPTION_CONFIG_KEY,
      value: normalized,
      description: "DG reward redemption settings, limits, fees, tax, chain wallets, and provider balance gating.",
    }, { onConflict: "key" });

  if (error) throw new Error(error.message);
  return normalized;
}

export function getRedemptionWallet(config: DgRedemptionConfig, chainId: number): string {
  const address = config.wallets_by_chain[String(chainId)]?.toLowerCase();
  if (!address || !ethers.isAddress(address)) {
    throw new Error("Redemption wallet is not configured for this network");
  }
  return address;
}

export function withRedemptionPricingDefaults(network: NetworkConfig): NetworkConfig {
  const pricing = withBaseMainnetPricingDefaults(network.chain_id, network as any) as any;
  return {
    ...network,
    ...(pricing || {}),
    is_active: network.is_active,
    unlock_factory_address: network.unlock_factory_address,
    refundable_event_manager_address: network.refundable_event_manager_address,
    ticket_pass_controller_address: network.ticket_pass_controller_address,
    g_token_address: network.g_token_address,
  } as NetworkConfig;
}

export function assertRedemptionEnabled(config: DgRedemptionConfig, chainId: number): void {
  if (!config.enabled) {
    throw new Error("Redeem DG is not available right now");
  }
  if (!config.supported_chains.includes(chainId)) {
    throw new Error("Redeem DG is not available on this network");
  }
}

export function parseReferenceId(prefix = "dgr"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`;
}

export function calculateFees(params: {
  grossValueKobo: number;
  vendorFeeKobo: number;
  config: DgRedemptionConfig;
}): FeeCalculation {
  const rawServiceFee = Math.floor((params.grossValueKobo * params.config.service_fee.bps) / 10_000);
  const serviceFeeKobo = Math.min(
    Math.max(rawServiceFee, params.config.service_fee.min_kobo),
    params.config.service_fee.max_kobo,
  );
  const vatBasisKobo = params.config.tax.enabled && params.config.tax.basis === "service_fee" ? serviceFeeKobo : 0;
  const vatKobo = params.config.tax.enabled && params.config.tax.basis === "service_fee"
    ? Math.floor((vatBasisKobo * params.config.tax.vat_bps) / 10_000)
    : 0;
  const totalFeeKobo = params.vendorFeeKobo + serviceFeeKobo + vatKobo;
  const netPayoutKobo = Math.max(params.grossValueKobo - serviceFeeKobo - vatKobo, 0);

  return {
    serviceFeeKobo,
    vatKobo,
    vatBasisKobo,
    totalFeeKobo,
    netPayoutKobo,
    feeBreakdown: {
      vendor_fee_kobo: params.vendorFeeKobo,
      service_fee_kobo: serviceFeeKobo,
      service_fee_bps: params.config.service_fee.bps,
      vat_kobo: vatKobo,
      vat_bps: params.config.tax.enabled ? params.config.tax.vat_bps : 0,
      vat_basis: params.config.tax.enabled ? params.config.tax.basis : "none",
      vat_basis_kobo: vatBasisKobo,
      total_fee_kobo: totalFeeKobo,
    },
  };
}

export function mapPaystackTransferStatus(params: {
  event?: unknown;
  status?: unknown;
}): DgRedemptionIntentStatus {
  const event = String(params.event || "").toLowerCase();
  const status = String(params.status || "").toLowerCase();
  if (event === "transfer.success" || status === "success" || status === "successful") return "completed";
  if (event === "transfer.failed" || event === "transfer.reversed" || isPaystackTransferTerminalFailureStatus(status)) {
    return "failed";
  }
  if (status === "otp") return "manual_review";
  return "payout_processing";
}

export function isPaystackTransferTerminalFailureStatus(status?: unknown): boolean {
  return ["failed", "reversed", "abandoned", "rejected", "blocked"].includes(String(status || "").toLowerCase());
}

export function isPaystackTransferActiveStatus(status?: unknown): boolean {
  return ["otp", "pending", "received", "queued", "processing"].includes(String(status || "").toLowerCase());
}

export function isDgRedemptionManuallyPayable(intent: any): boolean {
  if (!intent?.tx_hash) return false;
  const status = String(intent.status || "");
  if (!["failed", "manual_review", "payout_pending", "payout_processing"].includes(status)) return false;

  const paystackStatus = String(intent.paystack_status || "").toLowerCase();
  const hasPaystackTransfer = Boolean(intent.paystack_transfer_code || intent.paystack_transfer_id);
  if (!paystackStatus && !hasPaystackTransfer) return true;
  if (isPaystackTransferActiveStatus(paystackStatus) || paystackStatus === "success") return false;
  return isPaystackTransferTerminalFailureStatus(paystackStatus);
}

export function paystackTransferFailureReason(params: {
  event?: unknown;
  status?: unknown;
}): string {
  const event = String(params.event || "").toLowerCase();
  const status = String(params.status || "").toLowerCase();
  if (event === "transfer.reversed" || status === "reversed") return "paystack_transfer_reversed";
  if (status === "abandoned") return "paystack_transfer_abandoned";
  if (status === "rejected") return "paystack_transfer_rejected";
  if (status === "blocked") return "paystack_transfer_blocked";
  return "paystack_transfer_failed";
}

export function paystackTransferUpdateValues(params: {
  transfer: Partial<PaystackTransferData>;
  event?: unknown;
  now?: string;
  failedStatus?: "failed" | "manual_review";
}): Record<string, unknown> {
  const paystackStatus = String(params.transfer.status || "").toLowerCase();
  const mappedStatus = mapPaystackTransferStatus({ event: params.event, status: paystackStatus });
  const status = mappedStatus === "failed" && params.failedStatus ? params.failedStatus : mappedStatus;
  const values: Record<string, unknown> = {
    status,
    paystack_status: paystackStatus || null,
    lock_id: null,
    locked_at: null,
    last_error: null,
  };
  if (params.transfer.transfer_code) values.paystack_transfer_code = params.transfer.transfer_code;
  if (params.transfer.id !== undefined && params.transfer.id !== null) values.paystack_transfer_id = String(params.transfer.id);
  if (status === "completed") {
    values.completed_at = params.now || new Date().toISOString();
  }
  if (mappedStatus === "failed") {
    values.last_error = paystackTransferFailureReason({ event: params.event, status: paystackStatus });
  } else if (status === "manual_review") {
    values.last_error = "paystack_otp_required";
  }
  return values;
}

export function canApplyPaystackTransferStatus(params: {
  currentStatus: DgRedemptionIntentStatus | string;
  nextStatus: DgRedemptionIntentStatus | string;
  event?: unknown;
}): boolean {
  const currentStatus = String(params.currentStatus || "");
  const nextStatus = String(params.nextStatus || "");
  const event = String(params.event || "").toLowerCase();
  if (currentStatus === nextStatus) return true;
  if (currentStatus === "completed") {
    return nextStatus === "failed" && event === "transfer.reversed";
  }
  if (currentStatus === "cancelled" || currentStatus === "expired") return false;
  if (currentStatus === "failed") return nextStatus === "completed" || nextStatus === "failed";
  return true;
}

const PAYSTACK_RECONCILABLE_DG_REDEMPTION_STATUSES = new Set([
  "payout_pending",
  "payout_processing",
  "manual_review",
]);

export function canReconcileDgRedemptionPaystackTransfer(intent: any): boolean {
  return Boolean(
    PAYSTACK_RECONCILABLE_DG_REDEMPTION_STATUSES.has(String(intent?.status || "")) &&
      intent?.paystack_reference &&
      (intent?.paystack_transfer_code || intent?.paystack_transfer_id),
  );
}

export async function reconcileDgRedemptionPaystackTransfer(
  supabase: any,
  intent: any,
  options: {
    actorUserId?: string;
    eventType?: string;
    failedStatus?: "failed" | "manual_review";
    logPrefix?: string;
  } = {},
) {
  if (!canReconcileDgRedemptionPaystackTransfer(intent)) return intent;

  try {
    const verified = await verifyPaystackTransfer(intent.paystack_reference);
    const nextStatus = mapPaystackTransferStatus({ status: verified.data?.status });
    if (!canApplyPaystackTransferStatus({ currentStatus: intent.status, nextStatus })) {
      return intent;
    }

    let updateQuery = supabase
      .from("dg_redemption_intents")
      .update(paystackTransferUpdateValues({
        transfer: verified.data,
        failedStatus: options.failedStatus || "manual_review",
      }))
      .eq("id", intent.id)
      .eq("status", intent.status);

    if (intent.paystack_transfer_code === null || intent.paystack_transfer_code === undefined) {
      updateQuery = updateQuery.is("paystack_transfer_code", null);
    } else {
      updateQuery = updateQuery.eq("paystack_transfer_code", intent.paystack_transfer_code);
    }

    if (intent.paystack_transfer_id === null || intent.paystack_transfer_id === undefined) {
      updateQuery = updateQuery.is("paystack_transfer_id", null);
    } else {
      updateQuery = updateQuery.eq("paystack_transfer_id", intent.paystack_transfer_id);
    }

    const { data: updated, error } = await updateQuery.select("*").maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) return intent;

    await supabase.from("dg_redemption_events").insert({
      intent_id: updated.id,
      event_type: options.eventType || "paystack_transfer_reconciled",
      actor_user_id: options.actorUserId || updated.user_id,
      actor_wallet_address: updated.wallet_address,
      metadata: { paystack_transfer: verified.data, mapped_status: nextStatus },
    });

    return updated;
  } catch (error) {
    console.warn(
      `[${options.logPrefix || "dg-redemption"}] Paystack transfer reconciliation failed`,
      error instanceof Error ? error.message : error,
    );
    return intent;
  }
}

function requireAddress(value: string | null | undefined, label: string): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${label} is not configured`);
  }
  return value;
}

function requireRpcUrl(value: string | null | undefined): string {
  if (!value) throw new Error("RPC URL is not configured");
  return value;
}

function requireFee(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} is not configured`);
  }
  return Number(value);
}

function getResultAmountOut(result: any): bigint {
  const amountOut = Array.isArray(result) ? result[0] : result?.amountOut;
  if (amountOut === undefined || amountOut === null) {
    throw new Error("Uniswap quote did not return amountOut");
  }
  return BigInt(amountOut.toString());
}

async function fetchUniswapEdges(network: NetworkConfig): Promise<RateEdge[]> {
  const quoterAddress = requireAddress(network.uniswap_v3_quoter_address, "Uniswap V3 quoter address");
  const wethAddress = requireAddress(network.uniswap_v3_weth_address, "WETH address");
  const ethUsdcPoolAddress = requireAddress(network.uniswap_v3_eth_usdc_pool_address, "Uniswap V3 ETH/USDC pool address");
  const upAddress = requireAddress(network.up_token_address, "UP token address");
  const usdcAddress = requireAddress(network.usdc_token_address, "USDC token address");
  const upWethFee = requireFee(network.uniswap_v3_up_weth_fee, "UP/WETH fee tier");
  const wethUsdcFee = requireFee(network.uniswap_v3_weth_usdc_fee, "WETH/USDC fee tier");

  return await withPricingProviderFallback({
    chainId: network.chain_id,
    rpcUrl: network.rpc_url,
    label: "Uniswap quote",
    action: async (provider) => {
      const pool = new Contract(ethUsdcPoolAddress, UNISWAP_V3_POOL_ABI, provider);
      const [token0, token1, poolFee] = await Promise.all([pool.token0(), pool.token1(), pool.fee()]);
      const token0Lower = String(token0).toLowerCase();
      const token1Lower = String(token1).toLowerCase();
      const wethLower = wethAddress.toLowerCase();
      const usdcLower = usdcAddress.toLowerCase();

      if (!([token0Lower, token1Lower].includes(wethLower)) || !([token0Lower, token1Lower].includes(usdcLower))) {
        throw new Error("Uniswap V3 ETH/USDC pool does not match configured tokens");
      }

      const quoter = new Contract(quoterAddress, UNISWAP_QUOTER_V2_ABI, provider);
      const ethIn = 10n ** 18n;
      const upIn = 10n ** 18n;
      const upUsdcPath = ethers.solidityPacked(
        ["address", "uint24", "address", "uint24", "address"],
        [upAddress, upWethFee, wethAddress, wethUsdcFee, usdcAddress],
      );
      const [ethQuote, upQuote] = await Promise.all([
        quoter.quoteExactInputSingle.staticCall({
          tokenIn: wethAddress,
          tokenOut: usdcAddress,
          fee: Number(poolFee),
          amountIn: ethIn,
          sqrtPriceLimitX96: 0,
        }),
        quoter.quoteExactInput.staticCall(upUsdcPath, upIn),
      ]);

      return normalizeUniswapQuotesToEdges({
        ethIn,
        ethToUsdcOut: getResultAmountOut(ethQuote),
        upIn,
        upToUsdcOut: getResultAmountOut(upQuote),
      });
    },
  });
}

async function fetchVendorEdges(network: NetworkConfig): Promise<RateEdge[]> {
  const vendorAddress = requireAddress(network.dg_vendor_address, "DG vendor address");
  return await withPricingProviderFallback({
    chainId: network.chain_id,
    rpcUrl: network.rpc_url,
    label: "DG vendor rate",
    action: async (provider) => {
      const vendor = new Contract(vendorAddress, DG_VENDOR_ABI, provider);
      const tokenConfig = await vendor.getTokenConfig();
      const exchangeRate = tokenConfig.exchangeRate ?? tokenConfig[2];
      return normalizeVendorRateToEdges(BigInt(exchangeRate.toString()));
    },
  });
}

async function convertRawAmountsToNgnKobo(
  network: NetworkConfig,
  from: SupportedSymbol,
  amounts: Record<string, bigint>,
  decimals: number,
): Promise<{ amounts: Record<string, number>; snapshot: Record<string, unknown> }> {
  const entries = Object.entries(amounts);
  if (entries.every(([, amount]) => amount <= 0n)) {
    return {
      amounts: Object.fromEntries(entries.map(([key]) => [key, 0])),
      snapshot: { path: [], errors: [] },
    };
  }

  const snapshot = await getPricingSnapshot({
    fetchers: {
      vendor: () => fetchVendorEdges(network),
      uniswap: () => fetchUniswapEdges(network),
      fiat: () => fetchFiatEdges(),
    },
  });
  const result: Record<string, number> = {};
  let lastSnapshot: Record<string, unknown> = {
    path: [],
    stale: false,
    errors: [],
    as_of: snapshot.asOf,
  };

  for (const [key, raw] of entries) {
    const tokenAmount = Number(ethers.formatUnits(raw, decimals));
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      result[key] = 0;
      continue;
    }
    const conversion = await convertAmount({
      amount: tokenAmount,
      from,
      to: "NGN",
      snapshot,
    });
    if (!conversion.outputAmount || conversion.outputAmount <= 0) {
      throw new Error(conversion.errors[0] || "Could not price DG reward redemption");
    }
    result[key] = Math.floor(conversion.outputAmount * 100);
    lastSnapshot = {
      input_symbol: from,
      input_amount: tokenAmount,
      output_ngn: conversion.outputAmount,
      path: conversion.path,
      stale: conversion.stale,
      errors: conversion.errors,
      as_of: snapshot.asOf,
    };
  }

  return {
    amounts: result,
    snapshot: lastSnapshot,
  };
}

export async function priceDgRedemptionAmounts(
  network: NetworkConfig,
  amounts: Record<string, bigint>,
  dgDecimals: number,
): Promise<{ amounts: Record<string, number>; snapshot: Record<string, unknown> }> {
  return convertRawAmountsToNgnKobo(network, "DG", amounts, dgDecimals);
}

export async function getVendorRedemptionQuote(params: {
  network: NetworkConfig;
  walletAddress: string;
  amountDg: string;
  enforceWalletBalance?: boolean;
}): Promise<VendorRedemptionQuote> {
  const dgTokenAddress = requireAddress(params.network.dg_token_address, "DG token address");
  const upTokenAddress = requireAddress(params.network.up_token_address, "UP token address");
  const vendorAddress = requireAddress(params.network.dg_vendor_address, "DG vendor address");

  const chainState = await withPricingProviderFallback({
    chainId: params.network.chain_id,
    rpcUrl: params.network.rpc_url,
    label: "DG redemption vendor quote",
    action: async (provider) => {
      const dgToken = new Contract(dgTokenAddress, ERC20_ABI, provider);
      const upToken = new Contract(upTokenAddress, ERC20_ABI, provider);
      const vendor = new Contract(vendorAddress, DG_VENDOR_ABI, provider);
      const [
        dgDecimalsRaw,
        upDecimalsRaw,
        tokenConfigRaw,
        feeConfigRaw,
        paused,
        upBalanceRawValue,
        dgBalanceRawValue,
      ] = await Promise.all([
        dgToken.decimals(),
        upToken.decimals(),
        vendor.getTokenConfig(),
        vendor.getFeeConfig(),
        vendor.paused(),
        upToken.balanceOf(vendorAddress),
        dgToken.balanceOf(params.walletAddress),
      ]);

      return {
        dgDecimalsRaw,
        upDecimalsRaw,
        tokenConfigRaw,
        feeConfigRaw,
        paused,
        upBalanceRawValue,
        dgBalanceRawValue,
      };
    },
  });

  if (chainState.paused) throw new Error("Redeem DG is temporarily unavailable");

  const dgDecimals = Number(chainState.dgDecimalsRaw);
  const upDecimals = Number(chainState.upDecimalsRaw);
  const amountDgRaw = ethers.parseUnits(params.amountDg, dgDecimals);
  if (amountDgRaw <= 0n) throw new Error("Enter a DG amount to redeem");

  const tokenConfig = {
    baseToken: String(chainState.tokenConfigRaw.baseToken ?? chainState.tokenConfigRaw[0]).toLowerCase(),
    swapToken: String(chainState.tokenConfigRaw.swapToken ?? chainState.tokenConfigRaw[1]).toLowerCase(),
  };
  const exchangeRate = BigInt((chainState.tokenConfigRaw.exchangeRate ?? chainState.tokenConfigRaw[2]).toString());
  const sellFeeBps = Number(chainState.feeConfigRaw.sellFeeBps ?? chainState.feeConfigRaw[3]);

  if (tokenConfig.baseToken !== upTokenAddress.toLowerCase() || tokenConfig.swapToken !== dgTokenAddress.toLowerCase()) {
    throw new Error("DG vendor token configuration does not match this network");
  }
  if (exchangeRate <= 0n) throw new Error("DG vendor exchange rate is invalid");
  if (!Number.isFinite(sellFeeBps) || sellFeeBps < 0 || sellFeeBps > 10_000) {
    throw new Error("DG vendor fee configuration is invalid");
  }

  const vendorFeeDgRaw = (amountDgRaw * BigInt(Math.trunc(sellFeeBps))) / 10_000n;
  const netDgRaw = amountDgRaw - vendorFeeDgRaw;
  const preVendorUpOutRaw = amountDgRaw / exchangeRate;
  const estimatedUpOutRaw = netDgRaw / exchangeRate;
  const vendorFeeUpRaw = preVendorUpOutRaw - estimatedUpOutRaw;
  const upBalanceRaw = BigInt(chainState.upBalanceRawValue.toString());
  const dgBalanceRaw = BigInt(chainState.dgBalanceRawValue.toString());

  if (params.enforceWalletBalance !== false && amountDgRaw > dgBalanceRaw) {
    throw new Error("Your DG balance is not enough for this redemption");
  }

  return {
    amountDgRaw,
    vendorFeeDgRaw,
    netDgRaw,
    preVendorUpOutRaw,
    estimatedUpOutRaw,
    vendorFeeUpRaw,
    upBalanceRaw,
    dgBalanceRaw,
    dgDecimals,
    upDecimals,
    exchangeRate,
    sellFeeBps,
    liquidityExceeded: estimatedUpOutRaw > upBalanceRaw,
    tokenConfig,
    snapshot: {
      vendor_address: vendorAddress.toLowerCase(),
      dg_token_address: dgTokenAddress.toLowerCase(),
      up_token_address: upTokenAddress.toLowerCase(),
      exchange_rate: exchangeRate.toString(),
      sell_fee_bps: sellFeeBps,
      up_balance_raw: upBalanceRaw.toString(),
      dg_balance_raw: dgBalanceRaw.toString(),
      dg_decimals: dgDecimals,
      up_decimals: upDecimals,
    },
  };
}

export function validateAmountAgainstConfig(params: {
  amountDg: string;
  config: DgRedemptionConfig;
}): void {
  const amount = Number(params.amountDg);
  const min = Number(params.config.limits.min_dg);
  const max = Number(params.config.limits.max_dg);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid DG amount");
  }
  if (Number.isFinite(min) && amount < min) {
    throw new Error(`Minimum Redeem DG amount is ${params.config.limits.min_dg} DG`);
  }
  if (Number.isFinite(max) && max > 0 && amount > max) {
    throw new Error(`Maximum Redeem DG amount is ${params.config.limits.max_dg} DG`);
  }
}

export function getNgnBalanceKobo(balances: Array<{ currency: string; balance: number }>): number | null {
  const balance = balances.find((item) => String(item.currency).toUpperCase() === "NGN");
  return balance ? Number(balance.balance) : null;
}

async function importEncryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getBankSecret(): string {
  const secret = Deno.env.get("USER_PAYOUT_ACCOUNT_ENCRYPTION_KEY") || Deno.env.get("PAYOUT_ACCOUNT_ENCRYPTION_KEY");
  if (!secret || secret.length < 24) {
    throw new Error("Payout account encryption key is not configured");
  }
  return secret;
}

export async function encryptAccountNumber(accountNumber: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(getBankSecret());
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(accountNumber),
  );
  return `v1.${base64Encode(iv)}.${base64Encode(new Uint8Array(cipher))}`;
}

export async function decryptAccountNumber(encrypted: string): Promise<string> {
  const [version, ivEncoded, cipherEncoded] = String(encrypted).split(".");
  if (version !== "v1" || !ivEncoded || !cipherEncoded) {
    throw new Error("Invalid encrypted payout account");
  }
  const key = await importEncryptionKey(getBankSecret());
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64Decode(ivEncoded) },
    key,
    base64Decode(cipherEncoded),
  );
  return new TextDecoder().decode(plain);
}

export async function hashAccountNumber(accountNumber: string, bankCode: string): Promise<string> {
  const secret = getBankSecret();
  const payload = `${secret}:${bankCode}:${accountNumber}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPaystackWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.toLowerCase() === signature.toLowerCase();
}

export async function validateDgTransfer(params: {
  network: NetworkConfig;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  dgTokenAddress: string;
  amountDgRaw: string;
  requiredConfirmations: number;
}): Promise<Record<string, unknown>> {
  const provider = new JsonRpcProvider(requireRpcUrl(params.network.rpc_url));
  const hash = String(params.txHash || "").trim();
  if (!/^0x([A-Fa-f0-9]{64})$/.test(hash)) throw new Error("Enter a valid transaction hash");

  const [tx, receipt, latestBlock] = await Promise.all([
    provider.getTransaction(hash),
    provider.getTransactionReceipt(hash),
    provider.getBlockNumber(),
  ]);
  if (!tx || !receipt) throw new Error("Transaction was not found on this network");
  if (receipt.status !== 1) throw new Error("Transaction failed onchain");

  const confirmations = Math.max(latestBlock - receipt.blockNumber + 1, 0);
  if (confirmations < params.requiredConfirmations) {
    throw new Error(`Waiting for ${params.requiredConfirmations} confirmations`);
  }
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block) throw new Error("Transaction block was not found on this network");
  const blockTimestamp = new Date(block.timestamp * 1000).toISOString();

  const iface = new ethers.Interface(ERC20_ABI);
  const expectedFrom = params.fromAddress.toLowerCase();
  const expectedTo = params.toAddress.toLowerCase();
  const expectedToken = params.dgTokenAddress.toLowerCase();
  const expectedAmount = BigInt(params.amountDgRaw);

  for (const log of receipt.logs) {
    if (String(log.address).toLowerCase() !== expectedToken) continue;
    let parsed: ethers.LogDescription | null = null;
    try {
      parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    } catch (_) {
      parsed = null;
    }
    if (!parsed || parsed.name !== "Transfer") continue;
    const from = String(parsed.args.from).toLowerCase();
    const to = String(parsed.args.to).toLowerCase();
    const value = BigInt(parsed.args.value.toString());
    if (from === expectedFrom && to === expectedTo && value === expectedAmount) {
      return {
        tx_hash: hash.toLowerCase(),
        block_number: receipt.blockNumber,
        block_timestamp: blockTimestamp,
        block_timestamp_unix: block.timestamp,
        confirmations,
        from,
        to,
        value_raw: value.toString(),
      };
    }
  }

  throw new Error("Transaction does not match this Redeem DG request");
}

export async function getDgRedemptionDiagnostics(params: {
  config: DgRedemptionConfig;
  networks: NetworkConfig[];
}): Promise<DgRedemptionDiagnostics> {
  const paystackBalance = params.config.paystack_balance_cap_enabled
    ? await getPaystackBalances()
      .then((balances) => ({
        available_kobo: getNgnBalanceKobo(balances),
        status: "ok" as const,
      }))
      .catch((error) => ({
        available_kobo: null,
        status: "error" as const,
        error: error instanceof Error ? error.message : "Could not fetch Paystack balance",
      }))
    : { available_kobo: null, status: "disabled" as const };

  const chains = await Promise.all(params.networks.map(async (network) => {
    const supported = params.config.supported_chains.includes(network.chain_id);
    const redemptionWallet = params.config.wallets_by_chain[String(network.chain_id)] || null;
    try {
      const pricingNetwork = withRedemptionPricingDefaults(network);
      const rpcUrl = requireRpcUrl(pricingNetwork.rpc_url);
      const dgTokenAddress = requireAddress(pricingNetwork.dg_token_address, "DG token address");
      const upTokenAddress = requireAddress(pricingNetwork.up_token_address, "UP token address");
      const vendorAddress = requireAddress(pricingNetwork.dg_vendor_address, "DG vendor address");
      const provider = new JsonRpcProvider(rpcUrl);
      const vendor = new Contract(vendorAddress, DG_VENDOR_ABI, provider);
      const upToken = new Contract(upTokenAddress, ERC20_ABI, provider);
      const [paused, tokenConfigRaw, feeConfigRaw, exchangeRateRaw, upBalanceRawValue, upDecimalsRaw] = await Promise.all([
        vendor.paused(),
        vendor.getTokenConfig(),
        vendor.getFeeConfig(),
        vendor.getExchangeRate(),
        upToken.balanceOf(vendorAddress),
        upToken.decimals(),
      ]);
      const baseToken = String(tokenConfigRaw.baseToken ?? tokenConfigRaw[0]).toLowerCase();
      const swapToken = String(tokenConfigRaw.swapToken ?? tokenConfigRaw[1]).toLowerCase();
      const tokenConfigMatches = baseToken === upTokenAddress.toLowerCase() && swapToken === dgTokenAddress.toLowerCase();
      const sellFeeBps = Number(feeConfigRaw.sellFeeBps ?? feeConfigRaw[3]);
      const issues = [
        supported && !redemptionWallet ? "missing_redemption_wallet" : null,
        !tokenConfigMatches ? "token_config_mismatch" : null,
        paused ? "vendor_paused" : null,
        !Number.isFinite(sellFeeBps) || sellFeeBps < 0 || sellFeeBps > 10_000 ? "invalid_sell_fee" : null,
      ].filter(Boolean);
      return {
        chain_id: network.chain_id,
        chain_name: network.chain_name,
        supported,
        redemption_wallet_address: redemptionWallet,
        dg_token_address: dgTokenAddress.toLowerCase(),
        up_token_address: upTokenAddress.toLowerCase(),
        vendor_address: vendorAddress.toLowerCase(),
        token_config_matches: tokenConfigMatches,
        paused: Boolean(paused),
        exchange_rate: BigInt(exchangeRateRaw.toString()).toString(),
        sell_fee_bps: Number.isFinite(sellFeeBps) ? sellFeeBps : null,
        vendor_up_balance_raw: BigInt(upBalanceRawValue.toString()).toString(),
        vendor_up_balance_decimals: Number(upDecimalsRaw),
        status: issues.length ? "warning" as const : "ok" as const,
        error: issues.length ? issues.join(", ") : undefined,
      };
    } catch (error) {
      return {
        chain_id: network.chain_id,
        chain_name: network.chain_name,
        supported,
        redemption_wallet_address: redemptionWallet,
        dg_token_address: network.dg_token_address,
        up_token_address: network.up_token_address,
        vendor_address: network.dg_vendor_address,
        token_config_matches: null,
        paused: null,
        exchange_rate: null,
        sell_fee_bps: null,
        vendor_up_balance_raw: null,
        vendor_up_balance_decimals: null,
        status: "error" as const,
        error: error instanceof Error ? error.message : "Diagnostics failed",
      };
    }
  }));

  return { paystack_balance: paystackBalance, chains };
}

export function publicDgRedemptionIntent(intent: any): Record<string, unknown> {
  let amountDg = String(intent.fee_breakdown?.amount_dg || "");
  if (!amountDg && intent.amount_dg_raw) {
    try {
      const dgDecimals = Number(intent.vendor_snapshot?.dg_decimals ?? 18);
      amountDg = ethers.formatUnits(BigInt(String(intent.amount_dg_raw)), Number.isFinite(dgDecimals) ? dgDecimals : 18);
    } catch (_) {
      amountDg = String(intent.amount_dg_raw);
    }
  }
  const status = (() => {
    const value = String(intent.status || "");
    const expiresAtMs = intent.expires_at ? Date.parse(String(intent.expires_at)) : NaN;
    if (value === "awaiting_transfer" && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return "expired";
    }
    return value;
  })();

  return {
    id: intent.id,
    status,
    chain_id: intent.chain_id,
    wallet_address: intent.wallet_address,
    redemption_wallet_address: intent.redemption_wallet_address,
    amount_dg: amountDg,
    amount_dg_raw: intent.amount_dg_raw,
    pre_vendor_value_kobo: Number(intent.fee_breakdown?.pre_vendor_value_kobo || 0),
    gross_value_kobo: intent.gross_ngn_kobo,
    service_fee_kobo: intent.service_fee_kobo,
    vendor_fee_kobo: Number(intent.fee_breakdown?.vendor_fee_kobo || 0),
    vat_kobo: intent.vat_kobo,
    vat_basis_kobo: intent.vat_basis_kobo,
    total_fee_kobo: intent.total_fee_kobo,
    estimated_receive_kobo: intent.net_payout_kobo,
    required_confirmations: Number(intent.limits_snapshot?.required_confirmations || 0),
    tx_hash: intent.tx_hash,
    last_error: intent.last_error,
    expires_at: intent.expires_at,
    completed_at: intent.completed_at,
    created_at: intent.created_at,
    updated_at: intent.updated_at,
  };
}

export function getDgRedemptionAdminNotifyCooldownSeconds(): number {
  const configured = Number(Deno.env.get("DG_REDEMPTION_NOTIFY_ADMIN_COOLDOWN_SECONDS"));
  return Number.isFinite(configured) && configured > 0 ? Math.trunc(configured) : 60 * 60;
}

export async function getNextDgRedemptionAdminNotifyAt(supabase: any, intent: any): Promise<string | null> {
  if (!intent?.id || !intent?.user_id || String(intent.status) !== "manual_review") return null;

  const cooldownSeconds = getDgRedemptionAdminNotifyCooldownSeconds();
  const latestAllowedAt = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from("dg_redemption_events")
    .select("created_at")
    .eq("intent_id", intent.id)
    .eq("actor_user_id", intent.user_id)
    .eq("event_type", "user_admin_notification_sent")
    .gte("created_at", latestAllowedAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.created_at) return null;

  const nextNotifyAt = new Date(new Date(data.created_at).getTime() + cooldownSeconds * 1000).toISOString();
  return new Date(nextNotifyAt).getTime() > Date.now() ? nextNotifyAt : null;
}

export async function publicDgRedemptionIntentWithAdminNotify(
  supabase: any,
  intent: any,
): Promise<Record<string, unknown>> {
  return {
    ...publicDgRedemptionIntent(intent),
    next_admin_notify_at: await getNextDgRedemptionAdminNotifyAt(supabase, intent),
  };
}

export async function normalizeValidatedDgRedemptionFailure(supabase: any, intent: any): Promise<any> {
  if (String(intent?.status) !== "failed" || !intent?.id || !intent?.tx_hash) return intent;

  const { data: validatedEvent, error: validatedError } = await supabase
    .from("dg_redemption_events")
    .select("id")
    .eq("intent_id", intent.id)
    .eq("event_type", "transfer_validated")
    .limit(1)
    .maybeSingle();

  if (validatedError) throw new Error(validatedError.message);
  if (!validatedEvent) return intent;

  const { data: updated, error: updateError } = await supabase
    .from("dg_redemption_intents")
    .update({
      status: "manual_review",
      lock_id: null,
      locked_at: null,
    })
    .eq("id", intent.id)
    .eq("status", "failed")
    .not("tx_hash", "is", null)
    .select("*")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) return intent;

  await supabase.from("dg_redemption_events").insert({
    intent_id: updated.id,
    event_type: "validated_failure_moved_to_manual_review",
    actor_user_id: updated.user_id,
    actor_wallet_address: updated.wallet_address,
    metadata: { previous_status: "failed", last_error: updated.last_error || null },
  });

  return updated;
}

export function publicPayoutAccount(account: any, includeMasked = true): Record<string, unknown> | null {
  if (!account) return null;
  return {
    id: account.id,
    provider: account.provider,
    account_holder_name: account.account_holder_name,
    bank_code: account.bank_code,
    bank_name: account.bank_name,
    account_number: includeMasked ? `******${account.account_number_last4}` : undefined,
    account_number_last4: account.account_number_last4,
    currency: account.currency,
    status: account.status,
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}
