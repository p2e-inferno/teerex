import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

interface NetworkConfigsCache {
  data: NetworkConfig[];
  timestamp: number;
}

const CACHE_KEY = 'teerex_network_configs_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Custom hook for managing network configurations
 * Fetches active networks from database with caching
 */
export function useNetworkConfigs() {
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getCachedNetworks = useCallback((): NetworkConfig[] | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const { data, timestamp }: NetworkConfigsCache = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is still valid
      if (now - timestamp < CACHE_TTL) {
        console.log('Using cached network configs');
        return data;
      }

      // Cache expired, remove it
      localStorage.removeItem(CACHE_KEY);
      return null;
    } catch (error) {
      console.warn('Failed to read network configs cache:', error);
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  }, []);

  const setCachedNetworks = useCallback((data: NetworkConfig[]): void => {
    try {
      const cached: NetworkConfigsCache = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.warn('Failed to cache network configs:', error);
    }
  }, []);

  const fetchNetworks = useCallback(async (skipCache = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to get from cache first
      if (!skipCache) {
        const cachedData = getCachedNetworks();
        if (cachedData && cachedData.length > 0) {
          setNetworks(cachedData);
          setIsLoading(false);
          return;
        }
      }

      // Cache miss or skip cache - fetch from database
      console.log('Fetching fresh network configs from database');
      const { data, error: fetchError } = await supabase
        .from('network_configs')
        .select('*')
        .eq('is_active', true)
        .order('chain_id');

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        console.warn('No active networks found in database');
        setNetworks([]);
        setError('No active networks available. Please contact administrator.');
      } else {
        console.log(`Loaded ${data.length} active network(s) from database`);
        setNetworks(data);
        setCachedNetworks(data);
      }
    } catch (err) {
      console.error('Error fetching network configs:', err);
      setError('Failed to load network configurations');
      setNetworks([]);
    } finally {
      setIsLoading(false);
    }
  }, [getCachedNetworks, setCachedNetworks]);

  // Initial load
  useEffect(() => {
    fetchNetworks();
  }, [fetchNetworks]);

  // Helper: Get network by chain ID
  const getNetworkByChainId = useCallback((chainId: number): NetworkConfig | undefined => {
    return networks.find(n => n.chain_id === chainId);
  }, [networks]);

  // Helper: Check if network has USDC
  const hasUSDC = useCallback((chainId: number): boolean => {
    const network = getNetworkByChainId(chainId);
    return !!(network?.usdc_token_address);
  }, [getNetworkByChainId]);

  // Helper: Get USDC address for chain
  const getUsdcAddress = useCallback((chainId: number): string | null => {
    const network = getNetworkByChainId(chainId);
    return network?.usdc_token_address || null;
  }, [getNetworkByChainId]);

  // Helper: Get Unlock factory address for chain
  const getFactoryAddress = useCallback((chainId: number): string | null => {
    const network = getNetworkByChainId(chainId);
    return network?.unlock_factory_address || null;
  }, [getNetworkByChainId]);

  // Helper: Get RPC URL for chain
  const getRpcUrl = useCallback((chainId: number): string | null => {
    const network = getNetworkByChainId(chainId);
    return network?.rpc_url || null;
  }, [getNetworkByChainId]);

  // Helper: Clear cache and refresh
  const refreshNetworks = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    fetchNetworks(true);
  }, [fetchNetworks]);

  return {
    networks,
    isLoading,
    error,
    getNetworkByChainId,
    hasUSDC,
    getUsdcAddress,
    getFactoryAddress,
    getRpcUrl,
    refreshNetworks,
  };
}

// Global function to clear cache (useful for admin updates)
export function clearNetworkConfigsCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('Network configs cache cleared');

  // Dispatch custom event to notify listeners
  window.dispatchEvent(new CustomEvent('teerex-network-configs-updated'));
}
