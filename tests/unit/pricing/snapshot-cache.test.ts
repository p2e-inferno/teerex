import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPricingSnapshotCache,
  getCachedPricingSnapshot,
  getPricingSnapshotCacheKey,
} from '../../../supabase/functions/_shared/pricing/snapshot-cache.ts';
import type { RateEdge } from '../../../supabase/functions/_shared/pricing/types.ts';

const asOf = 1_717_171_717_000;

function edge(
  from: RateEdge['from'],
  to: RateEdge['to'],
  rate: number,
  source: RateEdge['source'],
): RateEdge {
  return { from, to, rate, source, asOf };
}

describe('pricing snapshot cache', () => {
  beforeEach(() => {
    clearPricingSnapshotCache();
  });

  it('reuses a source snapshot within the TTL and refreshes after expiry', async () => {
    let now = 1_000;
    const vendor = vi.fn(async () => [edge('DG', 'UP', 0.5, 'vendor')]);
    const uniswap = vi.fn(async () => [edge('UP', 'USDC', 3, 'uniswap')]);
    const fiat = vi.fn(async () => [edge('USD', 'NGN', 1000, 'fiat_api')]);
    const fetchers = { vendor, uniswap, fiat };

    const first = await getCachedPricingSnapshot({
      cacheKey: 'base',
      fetchers,
      now: () => now,
      ttlMs: 100,
    });
    const second = await getCachedPricingSnapshot({
      cacheKey: 'base',
      fetchers,
      now: () => now,
      ttlMs: 100,
    });

    expect(second).toBe(first);
    expect(vendor).toHaveBeenCalledTimes(1);
    expect(uniswap).toHaveBeenCalledTimes(1);
    expect(fiat).toHaveBeenCalledTimes(1);

    now = 1_101;
    await getCachedPricingSnapshot({
      cacheKey: 'base',
      fetchers,
      now: () => now,
      ttlMs: 100,
    });

    expect(vendor).toHaveBeenCalledTimes(2);
    expect(uniswap).toHaveBeenCalledTimes(2);
    expect(fiat).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent source snapshot loads for the same key', async () => {
    let resolveVendor!: (edges: RateEdge[]) => void;
    const vendor = vi.fn(() => new Promise<RateEdge[]>((resolve) => {
      resolveVendor = resolve;
    }));
    const fetchers = {
      vendor,
      uniswap: vi.fn(async () => [edge('UP', 'USDC', 3, 'uniswap')]),
      fiat: vi.fn(async () => [edge('USD', 'NGN', 1000, 'fiat_api')]),
    };

    const first = getCachedPricingSnapshot({ cacheKey: 'base', fetchers });
    const second = getCachedPricingSnapshot({ cacheKey: 'base', fetchers });

    expect(vendor).toHaveBeenCalledTimes(1);

    resolveVendor([edge('DG', 'UP', 0.5, 'vendor')]);
    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);

    expect(secondSnapshot).toBe(firstSnapshot);
  });

  it('keys snapshots by chain and source configuration', () => {
    const baseConfig = {
      chain_id: 8453,
      rpc_url: 'https://mainnet.base.org',
      usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      dg_token_address: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
      up_token_address: '0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187',
      dg_vendor_address: '0x24DD71aDd0026E924e0Fc7a7701A851e2b9c09C4',
      uniswap_v3_quoter_address: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      uniswap_v3_weth_address: '0x4200000000000000000000000000000000000006',
      uniswap_v3_eth_usdc_pool_address: '0xd0b53D9277642d899DF5C87A3966A349A798F224',
      uniswap_v3_up_weth_fee: 3000,
      uniswap_v3_weth_usdc_fee: 500,
    };

    expect(getPricingSnapshotCacheKey(baseConfig)).toBe(
      getPricingSnapshotCacheKey({
        ...baseConfig,
        rpc_url: ' HTTPS://MAINNET.BASE.ORG ',
      }),
    );
    expect(getPricingSnapshotCacheKey(baseConfig)).not.toBe(
      getPricingSnapshotCacheKey({
        ...baseConfig,
        rpc_url: 'https://example-rpc.invalid',
      }),
    );
  });
});
