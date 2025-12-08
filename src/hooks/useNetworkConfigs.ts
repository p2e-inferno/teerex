import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  fetchNetworkConfigs,
  fetchNetworkConfigByChainId,
  networkQueryKeys,
  clearNetworkMemoryCache,
} from '@/lib/config/network-config';
import type { NetworkConfig } from '@/lib/config/network-config';

/**
 * React Query hook: Fetch all network configs
 * Benefits: Auto-refetch, dedup, cache (5min), loading states
 */
export function useNetworkConfigsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: networkQueryKeys.all,
    queryFn: () => fetchNetworkConfigs(true), // Skip memory cache, React Query handles it
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
    ...options,
  });
}

/**
 * React Query hook: Fetch network config by chain ID
 */
export function useNetworkConfigByChainId(
  chainId: number | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: networkQueryKeys.byChainId(chainId!),
    queryFn: () => fetchNetworkConfigByChainId(chainId!, true), // Skip memory cache
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: chainId !== undefined && (options?.enabled ?? true),
  });
}

/**
 * Enhanced hook with helper functions
 * Replaces the old useNetworkConfigs implementation
 */
export function useNetworkConfigs() {
  const { data: networks = [], isLoading, error } = useNetworkConfigsQuery();
  const queryClient = useQueryClient();

  const helpers = useMemo(() => ({
    getNetworkByChainId: (chainId: number): NetworkConfig | undefined => {
      return networks.find(n => n.chain_id === chainId);
    },
    hasUSDC: (chainId: number): boolean => {
      const network = networks.find(n => n.chain_id === chainId);
      return !!network?.usdc_token_address;
    },
    getUsdcAddress: (chainId: number): string | null => {
      return networks.find(n => n.chain_id === chainId)?.usdc_token_address || null;
    },
    getFactoryAddress: (chainId: number): string | null => {
      return networks.find(n => n.chain_id === chainId)?.unlock_factory_address || null;
    },
    getRpcUrl: (chainId: number): string | null => {
      return networks.find(n => n.chain_id === chainId)?.rpc_url || null;
    },
  }), [networks]);

  const refreshNetworks = () => {
    clearNetworkMemoryCache(); // Clear in-memory cache too
    queryClient.invalidateQueries({ queryKey: networkQueryKeys.all });
  };

  return {
    networks,
    isLoading,
    error: error ? 'Failed to load network configurations' : null,
    refreshNetworks,
    ...helpers,
  };
}

// Utility for non-hook contexts (e.g., admin updates) to clear cached configs
export function clearNetworkConfigsCache(): void {
  clearNetworkMemoryCache();
}

// Export individual items for convenience
export type { NetworkConfig } from '@/lib/config/network-config';
