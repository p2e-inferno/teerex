import { getPricingSnapshot } from "./service.ts";
import type { PricingSnapshot, RateEdge } from "./types.ts";

export const PRICING_SNAPSHOT_CACHE_TTL_MS = 30_000;

export interface PricingSnapshotFetchers {
  vendor: () => Promise<RateEdge[]>;
  uniswap: () => Promise<RateEdge[]>;
  fiat: () => Promise<RateEdge[]>;
}

export interface PricingSnapshotCacheConfig {
  chain_id: number;
  rpc_url: string | null;
  usdc_token_address: string | null;
  dg_token_address?: string | null;
  up_token_address: string | null;
  dg_vendor_address: string | null;
  uniswap_v3_quoter_address: string | null;
  uniswap_v3_weth_address: string | null;
  uniswap_v3_eth_usdc_pool_address: string | null;
  uniswap_v3_up_weth_fee: number | null;
  uniswap_v3_weth_usdc_fee: number | null;
}

interface CacheEntry {
  snapshot: PricingSnapshot;
  expiresAt: number;
}

const snapshotCache = new Map<string, CacheEntry>();
const snapshotInflight = new Map<string, Promise<PricingSnapshot>>();

function normalizeKeyPart(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim().toLowerCase() : String(value);
}

export function getPricingSnapshotCacheKey(config: PricingSnapshotCacheConfig): string {
  return [
    config.chain_id,
    config.rpc_url,
    config.usdc_token_address,
    config.dg_token_address,
    config.up_token_address,
    config.dg_vendor_address,
    config.uniswap_v3_quoter_address,
    config.uniswap_v3_weth_address,
    config.uniswap_v3_eth_usdc_pool_address,
    config.uniswap_v3_up_weth_fee,
    config.uniswap_v3_weth_usdc_fee,
  ].map(normalizeKeyPart).join("|");
}

export function clearPricingSnapshotCache(): void {
  snapshotCache.clear();
  snapshotInflight.clear();
}

export async function getCachedPricingSnapshot(options: {
  cacheKey: string;
  fetchers: PricingSnapshotFetchers;
  now?: () => number;
  ttlMs?: number;
}): Promise<PricingSnapshot> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? PRICING_SNAPSHOT_CACHE_TTL_MS;
  const cached = snapshotCache.get(options.cacheKey);

  if (cached && cached.expiresAt > now()) {
    return cached.snapshot;
  }

  const inflight = snapshotInflight.get(options.cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = getPricingSnapshot({ fetchers: options.fetchers })
    .then((snapshot) => {
      snapshotCache.set(options.cacheKey, {
        snapshot,
        expiresAt: now() + ttlMs,
      });
      return snapshot;
    })
    .finally(() => {
      snapshotInflight.delete(options.cacheKey);
    });

  snapshotInflight.set(options.cacheKey, request);
  return request;
}
