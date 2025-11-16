import { base, baseSepolia } from 'wagmi/chains';
import { supabase } from '@/integrations/supabase/client';

export const CHAINS = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
} as const;

export type SupportedChainId = keyof typeof CHAINS;

export interface NetworkConfig {
  id: string;
  chain_id: number;
  chain_name: string;
  usdc_token_address: string | null;
  native_currency_symbol: string;
  rpc_url: string | null;
  block_explorer_url: string | null;
  is_mainnet: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Fallback networks for when database is unavailable
const FALLBACK_NETWORKS = [baseSepolia, base];

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function getRpcUrl(chainId: number): string {
  const chain = CHAINS[chainId as SupportedChainId];
  if (!chain) throw new Error(`Unsupported chainId ${chainId}`);
  
  const urls = chain.rpcUrls?.default?.http;
  if (!urls) {
    throw new Error(`No RPC URL for chainId ${chainId}`);
  }
  
  return urls[0];
}

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const chain = CHAINS[chainId as SupportedChainId];
  if (!chain || !chain.blockExplorers?.default?.url) return txHash;
  const baseUrl = chain.blockExplorers.default.url.replace(/\/$/, '');
  return `${baseUrl}/tx/${txHash}`;
}

// Token address helpers (addresses only; decimals resolved at runtime)
export function getUsdcAddress(chainId: number): string {
  if (chainId === base.id) {
    return import.meta.env.VITE_USDC_ADDRESS_BASE_MAINNET || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  }
  if (chainId === baseSepolia.id) {
    return import.meta.env.VITE_USDC_ADDRESS_BASE_SEPOLIA || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  }
  throw new Error(`USDC not configured for chainId ${chainId}`);
}

export function getTokenAddress(chainId: number, symbol: 'ETH' | 'USDC'): string {
  if (symbol === 'ETH') return ZERO_ADDRESS;
  return getUsdcAddress(chainId);
}

export async function getActiveNetworks(): Promise<NetworkConfig[]> {
  try {
    const { data, error } = await supabase
      .from('network_configs')
      .select('*')
      .eq('is_active', true)
      .order('chain_id');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn('Failed to fetch network configs from database, using fallbacks:', error);
    return [];
  }
}

export function getDefaultChainId(): number {
  const envValue = import.meta.env.VITE_PRIMARY_CHAIN_ID;
  return envValue ? Number(envValue) : 84532; // Base Sepolia as default
}

export function buildPrivyChains(networkConfigs: NetworkConfig[]): any[] {
  // If no database configs available, use wagmi fallbacks
  if (networkConfigs.length === 0) {
    return FALLBACK_NETWORKS.map(chain => {
      // Map chain ID to network name since wagmi chains don't have .network property
      const networkName = chain.id === 8453 ? 'base' : chain.id === 84532 ? 'base-sepolia' : 'unknown';
      
      return {
        id: chain.id,
        name: chain.name,
        network: networkName,
        nativeCurrency: {
          decimals: 18,
          name: 'Ethereum',
          symbol: 'ETH',
        },
        rpcUrls: {
          default: { http: chain.rpcUrls?.default?.http || [] },
          public: { http: chain.rpcUrls?.default?.http || [] },
        },
        blockExplorers: chain.blockExplorers?.default ? {
          default: chain.blockExplorers.default,
        } : undefined,
      };
    });
  }

  // Convert database configs to Privy format
  return networkConfigs.map(config => ({
    id: config.chain_id,
    name: config.chain_name,
    network: config.chain_name.toLowerCase().replace(/\s+/g, '-'),
    nativeCurrency: {
      decimals: 18, // Default until migration is applied
      name: config.native_currency_symbol === 'POL' ? 'Polygon Ecosystem Token' : 'Ethereum',
      symbol: config.native_currency_symbol,
    },
    rpcUrls: {
      default: { http: config.rpc_url ? [config.rpc_url] : [] },
      public: { http: config.rpc_url ? [config.rpc_url] : [] },
    },
    blockExplorers: config.block_explorer_url ? {
      default: {
        name: `${config.chain_name} Explorer`,
        url: config.block_explorer_url
      },
    } : undefined,
  }));
}

// Cache configuration
const CACHE_KEY = 'teerex_privy_config';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

interface CachedConfig {
  data: any;
  timestamp: number;
}

function getCachedPrivyConfig(): any | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const { data, timestamp }: CachedConfig = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (now - timestamp < CACHE_TTL) {
      console.log('Using cached Privy config');
      return data;
    }

    // Cache expired, remove it
    localStorage.removeItem(CACHE_KEY);
    return null;
  } catch (error) {
    console.warn('Failed to read Privy config cache:', error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function setCachedPrivyConfig(config: any): void {
  try {
    const cached: CachedConfig = {
      data: config,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to cache Privy config:', error);
  }
}

export async function getPrivyConfig(): Promise<any> {
  // Try to get from cache first
  const cachedConfig = getCachedPrivyConfig();
  if (cachedConfig) {
    return cachedConfig;
  }

  // Cache miss - fetch from database
  console.log('Fetching fresh Privy config from database');
  const networks = await getActiveNetworks();
  const chains = buildPrivyChains(networks);
  const defaultChainId = getDefaultChainId();

  // Find the default chain from loaded networks
  const defaultChain = chains.find(chain => chain.id === defaultChainId) || chains[0];

  const config = {
    appearance: {
      theme: 'light' as const,
      accentColor: '#676FFF',
    },
    embeddedWallets: {
      createOnLogin: 'users-without-wallets' as const,
    },
    loginMethods: ['email', 'wallet'] as const,
    defaultChain,
    supportedChains: chains,
  };

  // Cache the result
  setCachedPrivyConfig(config);

  return config;
}

// Export function to manually clear cache (useful for admin updates)
export function clearPrivyConfigCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('Privy config cache cleared');
}

