import { useQuery } from '@tanstack/react-query';
import { fetchNativeBalance, formatNativeBalance } from '@/utils/balanceHelpers';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';

/**
 * Cache configuration for balance queries
 * Balances are semi-volatile - they change with transactions
 * Using shorter cache time than token metadata
 */
const BALANCE_STALE_TIME_MS = 30 * 1000; // 30 seconds
const BALANCE_GC_TIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Query keys for native balance queries
 */
export const nativeBalanceQueryKeys = {
  all: ['native-balance'] as const,
  byChainAndAddress: (chainId: number, address: string) =>
    ['native-balance', chainId, address.toLowerCase()] as const,
};

/**
 * React Query hook: Fetch native token balance (ETH, POL, etc.) for an address
 *
 * @param address - The wallet address to check (will be normalized to lowercase)
 * @param chainId - The chain ID to query
 * @param options - React Query options
 *
 * @returns Query result with balance data, loading state, and refetch function
 *
 * @example
 * ```tsx
 * const { balance, formatted, isLoading, error, refetch } = useNativeBalance(
 *   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
 *   8453 // Base mainnet
 * );
 *
 * if (isLoading) return <Skeleton />;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>{formatted}</div>; // "1.5 ETH"
 * ```
 */
export function useNativeBalance(
  address: string | undefined,
  chainId: number | undefined,
  options?: { enabled?: boolean }
) {
  const { getNetworkByChainId } = useNetworkConfigs();
  const network = chainId ? getNetworkByChainId(chainId) : null;

  return useQuery({
    queryKey: nativeBalanceQueryKeys.byChainAndAddress(chainId!, address!),
    queryFn: async () => {
      const balance = await fetchNativeBalance(address!, chainId!);
      return {
        balance,
        formatted: formatNativeBalance(
          balance,
          network?.native_currency_symbol || 'ETH'
        ),
      };
    },
    staleTime: BALANCE_STALE_TIME_MS,
    gcTime: BALANCE_GC_TIME_MS,
    enabled:
      chainId !== undefined &&
      !!address &&
      address.length === 42 && // Valid Ethereum address length
      (options?.enabled ?? true),
    retry: 2, // Retry failed requests twice
    select: (data) => ({
      balance: data.balance,
      formatted: data.formatted,
    }),
  });
}
