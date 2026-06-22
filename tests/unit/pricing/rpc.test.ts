import { describe, expect, it } from 'vitest';
import { resolvePricingRpcUrls } from '../../../supabase/functions/_shared/pricing/rpc-urls.ts';

describe('pricing RPC resolution', () => {
  it('prefers the configured RPC and adds Base public fallbacks only for Base', () => {
    expect(resolvePricingRpcUrls(8453, 'https://configured.example')).toEqual([
      'https://configured.example',
      'https://mainnet.base.org',
      'https://1rpc.io/base',
    ]);

    expect(resolvePricingRpcUrls(42161, 'https://arb.example')).toEqual([
      'https://arb.example',
    ]);
  });
});
