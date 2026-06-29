import { describe, expect, it } from 'vitest';
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_MAINNET_PRICING_DEFAULTS,
  withBaseMainnetPricingDefaults,
} from '../../../supabase/functions/_shared/pricing/base-defaults.ts';

describe('base mainnet pricing defaults', () => {
  it('uses the P2E Inferno Base defaults when no network config is present', () => {
    expect(withBaseMainnetPricingDefaults(BASE_MAINNET_CHAIN_ID, null)).toEqual(
      BASE_MAINNET_PRICING_DEFAULTS,
    );
  });

  it('uses Base defaults for null or blank fields and keeps explicit overrides', () => {
    const resolved = withBaseMainnetPricingDefaults(BASE_MAINNET_CHAIN_ID, {
      chain_id: BASE_MAINNET_CHAIN_ID,
      chain_name: 'Custom Base',
      rpc_url: ' ',
      usdc_token_address: null,
      dg_token_address: '0x2222222222222222222222222222222222222222',
      up_token_address: null,
      dg_vendor_address: '0x3333333333333333333333333333333333333333',
      uniswap_v3_quoter_address: null,
      uniswap_v3_weth_address: null,
      uniswap_v3_eth_usdc_pool_address: null,
      uniswap_v3_up_weth_fee: 10000,
      uniswap_v3_weth_usdc_fee: null,
    });

    expect(resolved).toMatchObject({
      chain_name: 'Custom Base',
      rpc_url: BASE_MAINNET_PRICING_DEFAULTS.rpc_url,
      usdc_token_address: BASE_MAINNET_PRICING_DEFAULTS.usdc_token_address,
      dg_token_address: '0x2222222222222222222222222222222222222222',
      up_token_address: BASE_MAINNET_PRICING_DEFAULTS.up_token_address,
      dg_vendor_address: '0x3333333333333333333333333333333333333333',
      uniswap_v3_quoter_address:
        BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_quoter_address,
      uniswap_v3_weth_address:
        BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_weth_address,
      uniswap_v3_eth_usdc_pool_address:
        BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_eth_usdc_pool_address,
      uniswap_v3_up_weth_fee: 10000,
      uniswap_v3_weth_usdc_fee:
        BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_weth_usdc_fee,
    });
  });

  it('does not apply Base defaults to custom chains', () => {
    expect(withBaseMainnetPricingDefaults(42220, null)).toBeNull();
    expect(withBaseMainnetPricingDefaults(42220, {
      chain_id: 42220,
      chain_name: 'Celo',
      rpc_url: null,
      usdc_token_address: null,
      up_token_address: null,
      dg_vendor_address: null,
      uniswap_v3_quoter_address: null,
      uniswap_v3_weth_address: null,
      uniswap_v3_eth_usdc_pool_address: null,
      uniswap_v3_up_weth_fee: null,
      uniswap_v3_weth_usdc_fee: null,
    })).toEqual({
      chain_id: 42220,
      chain_name: 'Celo',
      rpc_url: null,
      usdc_token_address: null,
      up_token_address: null,
      dg_vendor_address: null,
      uniswap_v3_quoter_address: null,
      uniswap_v3_weth_address: null,
      uniswap_v3_eth_usdc_pool_address: null,
      uniswap_v3_up_weth_fee: null,
      uniswap_v3_weth_usdc_fee: null,
    });
  });
});
