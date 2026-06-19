export const BASE_MAINNET_CHAIN_ID = 8453;

export interface PricingNetworkConfig {
  chain_id: number;
  chain_name: string;
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

export const BASE_MAINNET_PRICING_DEFAULTS: PricingNetworkConfig = {
  chain_id: BASE_MAINNET_CHAIN_ID,
  chain_name: "Base Mainnet",
  rpc_url: "https://mainnet.base.org",
  usdc_token_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  dg_token_address: "0x4aA47eD29959c7053996d8f7918db01A62D02ee5",
  up_token_address: "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187",
  dg_vendor_address: "0x45adA67dc9a5fb49c5f1A88f0ff83fb0550b3A82",
  uniswap_v3_quoter_address: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  uniswap_v3_weth_address: "0x4200000000000000000000000000000000000006",
  uniswap_v3_eth_usdc_pool_address: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
  uniswap_v3_up_weth_fee: 3000,
  uniswap_v3_weth_usdc_fee: 500,
};

function configuredString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function configuredPositiveInteger(value: number | null | undefined): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export function withBaseMainnetPricingDefaults(
  chainId: number,
  network: Partial<PricingNetworkConfig> | null | undefined,
): PricingNetworkConfig | null {
  if (chainId !== BASE_MAINNET_CHAIN_ID) {
    return network ? network as PricingNetworkConfig : null;
  }

  return {
    chain_id: BASE_MAINNET_CHAIN_ID,
    chain_name: configuredString(network?.chain_name) ??
      BASE_MAINNET_PRICING_DEFAULTS.chain_name,
    rpc_url: configuredString(network?.rpc_url) ??
      BASE_MAINNET_PRICING_DEFAULTS.rpc_url,
    usdc_token_address: configuredString(network?.usdc_token_address) ??
      BASE_MAINNET_PRICING_DEFAULTS.usdc_token_address,
    dg_token_address: configuredString(network?.dg_token_address) ??
      BASE_MAINNET_PRICING_DEFAULTS.dg_token_address,
    up_token_address: configuredString(network?.up_token_address) ??
      BASE_MAINNET_PRICING_DEFAULTS.up_token_address,
    dg_vendor_address: configuredString(network?.dg_vendor_address) ??
      BASE_MAINNET_PRICING_DEFAULTS.dg_vendor_address,
    uniswap_v3_quoter_address:
      configuredString(network?.uniswap_v3_quoter_address) ??
      BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_quoter_address,
    uniswap_v3_weth_address:
      configuredString(network?.uniswap_v3_weth_address) ??
      BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_weth_address,
    uniswap_v3_eth_usdc_pool_address:
      configuredString(network?.uniswap_v3_eth_usdc_pool_address) ??
      BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_eth_usdc_pool_address,
    uniswap_v3_up_weth_fee:
      configuredPositiveInteger(network?.uniswap_v3_up_weth_fee) ??
      BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_up_weth_fee,
    uniswap_v3_weth_usdc_fee:
      configuredPositiveInteger(network?.uniswap_v3_weth_usdc_fee) ??
      BASE_MAINNET_PRICING_DEFAULTS.uniswap_v3_weth_usdc_fee,
  };
}
