
import { createConfig, http } from '@wagmi/core';
import { base, baseSepolia } from 'wagmi/chains';
import type { NetworkConfig } from '@/lib/config/network-config';
import { getNetworkConfigs } from '@/lib/config/network-config';

const FALLBACK_CHAINS = [baseSepolia, base];

function mapNetworkToWagmiChain(config: NetworkConfig) {
  if (!config.rpc_url) return null;
  return {
    id: config.chain_id,
    name: config.chain_name,
    nativeCurrency: {
      name: config.native_currency_name || 'Ether',
      symbol: config.native_currency_symbol,
      decimals: config.native_currency_decimals ?? 18,
    },
    rpcUrls: {
      default: { http: config.rpc_url ? [config.rpc_url] : [] },
      public: { http: config.rpc_url ? [config.rpc_url] : [] },
    },
    blockExplorers: config.block_explorer_url
      ? { default: { name: `${config.chain_name} Explorer`, url: config.block_explorer_url } }
      : undefined,
  };
}

export async function buildWagmiConfig() {
  let networks: NetworkConfig[] = [];
  try {
    networks = await getNetworkConfigs();
  } catch {
    networks = [];
  }

  const mappedChains = networks.length
    ? networks.map(mapNetworkToWagmiChain).filter((chain): chain is NonNullable<ReturnType<typeof mapNetworkToWagmiChain>> => chain !== null)
    : [];

  const chains = mappedChains.length > 0 ? mappedChains : FALLBACK_CHAINS;

  const transports = chains.reduce((acc, chain) => {
    const url = chain.rpcUrls?.default?.http?.[0];
    if (url) {
      acc[chain.id] = http(url);
    }
    return acc;
  }, {} as Record<number, ReturnType<typeof http>>);

  // Ensure fallbacks exist for Base/Base Sepolia in case DB has empty rpcUrls
  transports[base.id] = transports[base.id] || http();
  transports[baseSepolia.id] = transports[baseSepolia.id] || http();

  return createConfig({
    chains: chains.length >= 1 ? (chains as any) : FALLBACK_CHAINS,
    transports,
    multiInjectedProviderDiscovery: true,
  });
}

// Static fallback config (used until dynamic config loads)
export const wagmiConfig = createConfig({
  chains: FALLBACK_CHAINS as any,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
  multiInjectedProviderDiscovery: true,
});
