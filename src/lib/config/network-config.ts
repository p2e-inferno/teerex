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
  unlock_factory_address: string | null;
  native_currency_symbol: string;
  native_currency_name: string | null;
  native_currency_decimals: number | null;
  rpc_url: string | null;
  block_explorer_url: string | null;
  is_mainnet: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function isValidNetworkConfig(data: any): data is NetworkConfig {
  return (
    data &&
    typeof data.id === 'string' &&
    typeof data.chain_id === 'number' &&
    typeof data.chain_name === 'string' &&
    typeof data.native_currency_symbol === 'string' &&
    typeof data.is_active === 'boolean' &&
    typeof data.is_mainnet === 'boolean' &&
    (data.usdc_token_address === null || typeof data.usdc_token_address === 'string') &&
    (data.unlock_factory_address === null || typeof data.unlock_factory_address === 'string') &&
    (data.native_currency_name === null || typeof data.native_currency_name === 'string') &&
    (data.native_currency_decimals === null || typeof data.native_currency_decimals === 'number') &&
    (data.rpc_url === null || typeof data.rpc_url === 'string') &&
    (data.block_explorer_url === null || typeof data.block_explorer_url === 'string') &&
    (data.created_at === undefined || typeof data.created_at === 'string') &&
    (data.updated_at === undefined || typeof data.updated_at === 'string')
  );
}

// Fallback networks for when database is unavailable
const FALLBACK_NETWORKS = [baseSepolia, base];

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ============================================================================
// LIGHTWEIGHT IN-MEMORY CACHE (for non-React code)
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MEMORY_CACHE_TTL = 60 * 1000; // 60 seconds (shorter than React Query)
let networksCache: CacheEntry<NetworkConfig[]> | null = null;
const chainConfigCache = new Map<number, CacheEntry<NetworkConfig | null>>();

/**
 * Clear all in-memory caches
 */
export function clearNetworkMemoryCache(): void {
  networksCache = null;
  chainConfigCache.clear();
  console.log('[network-config] Memory cache cleared');
}

// ============================================================================
// CORE FETCH FUNCTIONS (work in any context)
// ============================================================================

/**
 * Fetch all active network configs from database
 * Uses simple in-memory cache (60s TTL) for non-React contexts
 *
 * @param skipCache - Bypass cache and fetch fresh
 */
export async function fetchNetworkConfigs(skipCache = false): Promise<NetworkConfig[]> {
  // Check memory cache
  if (!skipCache && networksCache && Date.now() - networksCache.timestamp < MEMORY_CACHE_TTL) {
    console.log('[network-config] Using memory cache (all networks)');
    return networksCache.data;
  }

  // Fetch from database
  console.log('[network-config] Fetching fresh network configs from database');
  const { data, error } = await supabase
    .from('network_configs')
    .select('*')
    .eq('is_active', true)
    .order('chain_id');

  if (error) {
    console.error('[network-config] Database error:', error);
    throw new Error(`Failed to fetch network configs: ${error.message}`);
  }

  const networks = (data || []).filter(config => {
    const isValid = isValidNetworkConfig(config);
    if (!isValid) {
      console.error('[network-config] Invalid network config from database:', config);
    }
    return isValid;
  });

  // Update cache
  networksCache = { data: networks, timestamp: Date.now() };

  return networks;
}

/**
 * Fetch network config by chain ID from database
 * Uses simple in-memory cache (60s TTL) for non-React contexts
 *
 * @param chainId - Chain ID to fetch
 * @param skipCache - Bypass cache and fetch fresh
 */
export async function fetchNetworkConfigByChainId(
  chainId: number,
  skipCache = false
): Promise<NetworkConfig | null> {
  // Check memory cache
  const cached = chainConfigCache.get(chainId);
  if (!skipCache && cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
    console.log(`[network-config] Using memory cache (chain ${chainId})`);
    return cached.data;
  }

  // Fetch from database
  console.log(`[network-config] Fetching network config for chain ${chainId}`);
  const { data, error } = await supabase
    .from('network_configs')
    .select('*')
    .eq('chain_id', chainId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error(`[network-config] Database error for chain ${chainId}:`, error);
    throw new Error(`Failed to fetch network config for chain ${chainId}: ${error.message}`);
  }

  if (data && !isValidNetworkConfig(data)) {
    console.error(`[network-config] Invalid network config for chain ${chainId}:`, data);
    chainConfigCache.set(chainId, { data: null, timestamp: Date.now() });
    return null;
  }

  // Update cache
  chainConfigCache.set(chainId, { data, timestamp: Date.now() });

  return data;
}

// ============================================================================
// PUBLIC API (for non-React contexts like lockUtils.ts)
// ============================================================================

/**
 * Get all active network configs
 * For use in non-React contexts (uses lightweight 60s memory cache)
 */
export async function getNetworkConfigs(): Promise<NetworkConfig[]> {
  return fetchNetworkConfigs();
}

/**
 * Get network config by chain ID
 * For use in non-React contexts (uses lightweight 60s memory cache)
 */
export async function getNetworkConfigByChainId(chainId: number): Promise<NetworkConfig | null> {
  return fetchNetworkConfigByChainId(chainId);
}

// ============================================================================
// REACT QUERY INTEGRATION (for React components)
// ============================================================================

export const networkQueryKeys = {
  all: ['network-configs'] as const,
  byChainId: (chainId: number) => ['network-configs', chainId] as const,
};

// ============================================================================
// BACKWARDS COMPATIBILITY & DEPRECATED FUNCTIONS
// ============================================================================

/** @deprecated Use getNetworkConfigByChainId instead for dynamic DB lookup */
export function getRpcUrl(chainId: number): string {
  const chain = CHAINS[chainId as SupportedChainId];
  if (!chain) throw new Error(`Unsupported chainId ${chainId}`);

  const urls = chain.rpcUrls?.default?.http;
  if (!urls) {
    throw new Error(`No RPC URL for chainId ${chainId}`);
  }

  return urls[0];
}

/** @deprecated Prefer getNetworkConfigByChainId + block_explorer_url; falls back to wagmi chains */
export async function getExplorerTxUrl(chainId: number, txHash: string): Promise<string> {
  try {
    const networkConfig = await getNetworkConfigByChainId(chainId);
    if (networkConfig?.block_explorer_url) {
      const baseUrl = networkConfig.block_explorer_url.replace(/\/$/, '');
      return `${baseUrl}/tx/${txHash}`;
    }
  } catch (error) {
    console.warn(`[network-config] Failed to resolve explorer for chain ${chainId}:`, error);
  }

  const chain = CHAINS[chainId as SupportedChainId];
  if (chain?.blockExplorers?.default?.url) {
    const baseUrl = chain.blockExplorers.default.url.replace(/\/$/, '');
    return `${baseUrl}/tx/${txHash}`;
  }

  return txHash;
}

function getBaseUsdcFallback(chainId: number): string | null {
  if (chainId === base.id) {
    return import.meta.env.VITE_USDC_ADDRESS_BASE_MAINNET || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  }
  if (chainId === baseSepolia.id) {
    return import.meta.env.VITE_USDC_ADDRESS_BASE_SEPOLIA || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  }
  return null;
}

// Token address helpers (addresses only; decimals resolved at runtime)
// DEPRECATED: Use getUsdcAddressAsync() instead for dynamic lookup
export function getUsdcAddress(chainId: number): string {
  // Fallback for backwards compatibility - only works for Base networks
  const fallback = getBaseUsdcFallback(chainId);
  if (fallback) {
    return fallback;
  }
  throw new Error(`USDC not configured for chainId ${chainId}. Use getUsdcAddressAsync() instead.`);
}

/**
 * Get USDC address for a chain from database
 * Returns null if USDC is not configured for this chain
 */
export async function getUsdcAddressAsync(chainId: number): Promise<string | null> {
  try {
    const networkConfig = await getNetworkConfigByChainId(chainId);

    if (!networkConfig) {
      return getBaseUsdcFallback(chainId);
    }

    return networkConfig.usdc_token_address || null;
  } catch (error) {
    console.error(`Error fetching USDC address for chain ${chainId}:`, error);
    return getBaseUsdcFallback(chainId);
  }
}

export async function getTokenAddressAsync(chainId: number, symbol: 'ETH' | 'USDC'): Promise<string | null> {
  if (symbol === 'ETH') return ZERO_ADDRESS;
  return getUsdcAddressAsync(chainId);
}

export function getTokenAddress(chainId: number, symbol: 'ETH' | 'USDC'): string {
  if (symbol === 'ETH') return ZERO_ADDRESS;
  return getUsdcAddress(chainId);
}

/**
 * Get all active networks (uses new cached fetch function)
 * @deprecated Use getNetworkConfigs() or fetchNetworkConfigs() instead
 */
export async function getActiveNetworks(): Promise<NetworkConfig[]> {
  try {
    return await fetchNetworkConfigs();
  } catch (error) {
    console.error('Database error fetching network configs:', error);
    return []; // Return empty to trigger fallback in buildPrivyChains
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
      decimals: config.native_currency_decimals ?? 18,
      name: config.native_currency_name || (config.native_currency_symbol === 'POL' ? 'Polygon' : 'Ethereum'),
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

// Custom event for cache invalidation
const CACHE_CLEAR_EVENT = 'teerex-network-cache-cleared';

// Export function to manually clear cache (useful for admin updates)
export function clearPrivyConfigCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('Privy config cache cleared');

  // Dispatch custom event to notify listeners (e.g., PrivyProvider)
  window.dispatchEvent(new CustomEvent(CACHE_CLEAR_EVENT));
}

export function clearAllNetworkCaches(): void {
  clearNetworkMemoryCache();
  clearPrivyConfigCache();
}

// Subscribe to cache clear events
export function onCacheClear(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(CACHE_CLEAR_EVENT, handler);

  // Return unsubscribe function
  return () => window.removeEventListener(CACHE_CLEAR_EVENT, handler);
}
