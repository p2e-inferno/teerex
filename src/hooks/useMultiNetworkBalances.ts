import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { fetchNativeBalance, fetchERC20Balance, formatNativeBalance, formatERC20Balance } from '@/utils/balanceHelpers';
import type { CryptoCurrency } from '@/types/currency';

const BALANCE_STALE_TIME_MS = 30 * 1000; // 30 seconds
const BALANCE_GC_TIME_MS = 5 * 60 * 1000; // 5 minutes

// Base Mainnet fallback when no active networks are configured
const BASE_MAINNET_FALLBACK = {
  chain_id: 8453,
  chain_name: 'Base',
  native_currency_symbol: 'ETH',
  native_currency_decimals: 18,
  rpc_url: 'https://mainnet.base.org',
  usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  dg_token_address: null,
  g_token_address: null,
  up_token_address: null,
};

/**
 * Token balance data for a single token on a network
 */
export interface TokenBalance {
  symbol: CryptoCurrency;
  address: string;
  balance: bigint;
  formatted: string;
  decimals: number;
}

/**
 * Native balance data for a network
 */
export interface NativeBalance {
  balance: bigint;
  formatted: string;
  symbol: string;
}

/**
 * Complete balance data for a single network
 */
export interface NetworkBalances {
  chainId: number;
  chainName: string;
  native: NativeBalance;
  tokens: TokenBalance[];
}

/**
 * Aggregated balance data across all networks
 */
export interface MultiNetworkBalancesResult {
  balancesByChain: Record<number, NetworkBalances>;
  isLoading: boolean;
  hasError: boolean;
  refetchAll: () => void;
}

/**
 * React Query hook: Fetch balances across all active networks for a user
 *
 * Fetches native and ERC-20 balances in parallel for all configured networks
 * Returns aggregated data organized by chain ID
 *
 * @param address - The wallet address to check balances for
 *
 * @returns Multi-network balance data with loading states and refetch function
 *
 * @example
 * ```tsx
 * const { balancesByChain, isLoading, refetchAll } = useMultiNetworkBalances(userAddress);
 *
 * // Access Base mainnet balances
 * const baseBalances = balancesByChain[8453];
 * console.log(baseBalances?.native.formatted); // "1.5 ETH"
 * console.log(baseBalances?.tokens[0].formatted); // "100 USDC"
 *
 * // Refresh all balances
 * <Button onClick={refetchAll}>Refresh</Button>
 * ```
 */
export function useMultiNetworkBalances(
  address: string | undefined
): MultiNetworkBalancesResult {
  const { networks: activeNetworks } = useNetworkConfigs();
  const queryClient = useQueryClient();

  // Use active networks or fallback to Base Mainnet if none configured
  const networks = useMemo(() => {
    if (activeNetworks.length > 0) {
      return activeNetworks;
    }
    // Fallback to Base Mainnet
    return [BASE_MAINNET_FALLBACK as any];
  }, [activeNetworks]);

  // Create queries for each network's native + token balances
  const queries = useMemo(() => {
    if (!address || networks.length === 0) return [];

    const balanceQueries = networks.flatMap(network => {
      const queries = [];

      // Native balance query for this network
      queries.push({
        queryKey: ['native-balance', network.chain_id, address.toLowerCase()],
        queryFn: async () => {
          const balance = await fetchNativeBalance(address, network.chain_id);
          return {
            type: 'native' as const,
            chainId: network.chain_id,
            balance,
            formatted: formatNativeBalance(balance, network.native_currency_symbol),
            symbol: network.native_currency_symbol,
          };
        },
        staleTime: BALANCE_STALE_TIME_MS,
        gcTime: BALANCE_GC_TIME_MS,
        retry: 2,
      });

      // ERC-20 balance queries for available tokens on this network
      const tokenMap: Array<{ symbol: CryptoCurrency; address: string | null }> = [
        { symbol: 'USDC', address: network.usdc_token_address },
        { symbol: 'DG', address: network.dg_token_address },
        { symbol: 'G', address: network.g_token_address },
        { symbol: 'UP', address: network.up_token_address },
      ];

      tokenMap.forEach(({ symbol, address: tokenAddress }) => {
        if (tokenAddress) {
          queries.push({
            queryKey: ['erc20-balance', network.chain_id, tokenAddress.toLowerCase(), address.toLowerCase()],
            queryFn: async () => {
              const balance = await fetchERC20Balance(tokenAddress, address, network.chain_id);

              // Get metadata from cache (should be pre-fetched)
              const metadata = queryClient.getQueryData<{ decimals: number; symbol: string }>([
                'token-metadata',
                network.chain_id,
                tokenAddress.toLowerCase(),
              ]);

              const decimals = metadata?.decimals || 18; // Fallback to 18
              const tokenSymbol = metadata?.symbol || symbol;

              return {
                type: 'token' as const,
                chainId: network.chain_id,
                symbol,
                address: tokenAddress,
                balance,
                formatted: formatERC20Balance(balance, tokenSymbol, decimals),
                decimals,
              };
            },
            staleTime: BALANCE_STALE_TIME_MS,
            gcTime: BALANCE_GC_TIME_MS,
            retry: 2,
          });
        }
      });

      return queries;
    });

    return balanceQueries;
  }, [address, networks, queryClient]);

  // Execute all queries in parallel
  const results = useQueries({ queries });

  // Aggregate results by chain ID
  const aggregated = useMemo(() => {
    const byChain: Record<number, NetworkBalances> = {};

    results.forEach((result: any) => {
      if (!result.data) return;

      const { chainId } = result.data;

      if (!byChain[chainId]) {
        const network = networks.find(n => n.chain_id === chainId);
        if (!network) return;

        byChain[chainId] = {
          chainId,
          chainName: network.chain_name,
          native: {
            balance: 0n,
            formatted: '0',
            symbol: network.native_currency_symbol,
          },
          tokens: [],
        };
      }

      if (result.data.type === 'native') {
        byChain[chainId].native = {
          balance: result.data.balance,
          formatted: result.data.formatted,
          symbol: result.data.symbol,
        };
      } else if (result.data.type === 'token') {
        byChain[chainId].tokens.push({
          symbol: result.data.symbol,
          address: result.data.address,
          balance: result.data.balance,
          formatted: result.data.formatted,
          decimals: result.data.decimals,
        });
      }
    });

    return byChain;
  }, [results, networks]);

  // Refetch all balances
  const refetchAll = () => {
    results.forEach((result: any) => result.refetch());
  };

  return {
    balancesByChain: aggregated,
    isLoading: results.some((r: any) => r.isLoading),
    hasError: results.some((r: any) => r.isError),
    refetchAll,
  };
}
