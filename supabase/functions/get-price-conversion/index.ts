/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { Contract, ethers } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { SUPPORTED_SYMBOLS } from "../_shared/pricing/constants.ts";
import {
  BASE_MAINNET_CHAIN_ID,
  withBaseMainnetPricingDefaults,
  type PricingNetworkConfig,
} from "../_shared/pricing/base-defaults.ts";
import { convertAmount, getSpotRate } from "../_shared/pricing/service.ts";
import {
  getCachedPricingSnapshot,
  getPricingSnapshotCacheKey,
} from "../_shared/pricing/snapshot-cache.ts";
import type { RateEdge, SupportedSymbol } from "../_shared/pricing/types.ts";
import { fetchFiatEdges } from "../_shared/pricing/sources/fiat.ts";
import { normalizeUniswapQuotesToEdges } from "../_shared/pricing/sources/uniswap.ts";
import { normalizeVendorRateToEdges } from "../_shared/pricing/sources/vendor.ts";
import { withPricingProviderFallback } from "../_shared/pricing/rpc.ts";

const DEFAULT_CHAIN_ID = BASE_MAINNET_CHAIN_ID;

const DG_VENDOR_ABI = [
  "function getExchangeRate() view returns (uint256)",
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

function parseAmount(value: unknown): number {
  if (value === null || value === undefined) {
    return Number.NaN;
  }
  if (typeof value === "string" && value.trim() === "") {
    return Number.NaN;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function parseSymbol(value: unknown, fieldName: string): SupportedSymbol {
  const symbol = String(value || "").trim().toUpperCase();
  if (!SUPPORTED_SYMBOLS.includes(symbol as SupportedSymbol)) {
    throw new Error(`${fieldName} is not supported`);
  }
  return symbol as SupportedSymbol;
}

function requireAddress(value: string | null | undefined, label: string): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${label} is not configured`);
  }
  return value;
}

function requireFee(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} is not configured`);
  }
  return Number(value);
}

function lower(value: string): string {
  return value.toLowerCase();
}

function getResultAmountOut(result: any): bigint {
  const amountOut = Array.isArray(result) ? result[0] : result?.amountOut;
  if (amountOut === undefined || amountOut === null) {
    throw new Error("Uniswap quote did not return amountOut");
  }
  return BigInt(amountOut.toString());
}

async function fetchVendorEdges(network: PricingNetworkConfig): Promise<RateEdge[]> {
  const vendorAddress = requireAddress(network.dg_vendor_address, "DG vendor address");
  return await withPricingProviderFallback({
    chainId: network.chain_id,
    rpcUrl: network.rpc_url,
    label: "DG vendor rate",
    action: async (provider) => {
      const vendor = new Contract(vendorAddress, DG_VENDOR_ABI, provider);
      const exchangeRate = await vendor.getExchangeRate();

      return normalizeVendorRateToEdges(BigInt(exchangeRate.toString()));
    },
  });
}

async function fetchUniswapEdges(network: PricingNetworkConfig): Promise<RateEdge[]> {
  const quoterAddress = requireAddress(
    network.uniswap_v3_quoter_address,
    "Uniswap V3 quoter address",
  );
  const wethAddress = requireAddress(network.uniswap_v3_weth_address, "WETH address");
  const ethUsdcPoolAddress = requireAddress(
    network.uniswap_v3_eth_usdc_pool_address,
    "Uniswap V3 ETH/USDC pool address",
  );
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
      const [token0, token1, poolFee] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.fee(),
      ]);

      const token0Lower = lower(String(token0));
      const token1Lower = lower(String(token1));
      const wethLower = lower(wethAddress);
      const usdcLower = lower(usdcAddress);
      const poolHasWeth = token0Lower === wethLower || token1Lower === wethLower;
      const poolHasUsdc = token0Lower === usdcLower || token1Lower === usdcLower;

      if (!poolHasWeth || !poolHasUsdc) {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const amount = parseAmount(body.amount);
    if (!Number.isFinite(amount)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const from = parseSymbol(body.from, "from");
    const to = parseSymbol(body.to, "to");
    const chainId = Number(body.chain_id ?? body.chainId ?? DEFAULT_CHAIN_ID);
    if (!Number.isFinite(chainId) || chainId <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid chain_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: network, error: networkError } = await supabase
      .from("network_configs")
      .select("chain_id,chain_name,rpc_url,usdc_token_address,dg_token_address,up_token_address,dg_vendor_address,uniswap_v3_quoter_address,uniswap_v3_weth_address,uniswap_v3_eth_usdc_pool_address,uniswap_v3_up_weth_fee,uniswap_v3_weth_usdc_fee")
      .eq("chain_id", chainId)
      .eq("is_active", true)
      .maybeSingle();

    if (networkError) {
      return new Response(JSON.stringify({ ok: false, error: networkError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pricingNetwork = withBaseMainnetPricingDefaults(
      chainId,
      network as Partial<PricingNetworkConfig> | null,
    );

    if (!pricingNetwork) {
      return new Response(JSON.stringify({ ok: false, error: "Network not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const snapshot = await getCachedPricingSnapshot({
      cacheKey: getPricingSnapshotCacheKey(pricingNetwork),
      fetchers: {
        vendor: () => fetchVendorEdges(pricingNetwork),
        uniswap: () => fetchUniswapEdges(pricingNetwork),
        fiat: () => fetchFiatEdges(),
      },
    });
    const [conversion, spotRate] = await Promise.all([
      convertAmount({
        amount,
        from,
        to,
        snapshot,
      }),
      getSpotRate({
        from,
        to,
        snapshot,
      }),
    ]);
    const quote = {
      ...conversion,
      from,
      to,
      spotRate,
      asOf: snapshot.asOf ?? null,
    };

    return new Response(JSON.stringify({ ok: true, chain_id: chainId, quote }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = message.includes("not supported") ? 400 : 500;
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
