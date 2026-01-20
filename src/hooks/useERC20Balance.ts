import { useQuery } from '@tanstack/react-query';
import { fetchERC20Balance, formatERC20Balance } from '@/utils/balanceHelpers';
import { useTokenMetadata } from '@/hooks/useTokenMetadata';

/**
 * Cache configuration for ERC-20 balance queries
 * Same as native balances - semi-volatile data
 */
const BALANCE_STALE_TIME_MS = 30 * 1000; // 30 seconds
const BALANCE_GC_TIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Query keys for ERC-20 balance queries
 */
export const erc20BalanceQueryKeys = {
  all: ['erc20-balance'] as const,
  byTokenAndAddress: (chainId: number, tokenAddress: string, userAddress: string) =>
    ['erc20-balance', chainId, tokenAddress.toLowerCase(), userAddress.toLowerCase()] as const,
};

/**
 * React Query hook: Fetch ERC-20 token balance for an address
 *
 * Leverages useTokenMetadata to get token symbol and decimals for formatting
 * No duplicate RPC calls - metadata is cached separately
 *
 * @param tokenAddress - The ERC-20 token contract address
 * @param userAddress - The wallet address to check
 * @param chainId - The chain ID to query
 * @param options - React Query options
 *
 * @returns Query result with balance data, metadata, and loading states
 *
 * @example
 * ```tsx
 * const { balance, formatted, symbol, decimals, isLoading, error } = useERC20Balance(
 *   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
 *   '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
 *   8453 // Base mainnet
 * );
 *
 * if (isLoading) return <Skeleton />;
 * if (error) return <div>Error: {error.message}</div>;
 * return <div>{formatted}</div>; // "100.5 USDC"
 * ```
 */
export function useERC20Balance(
  tokenAddress: string | undefined | null,
  userAddress: string | undefined,
  chainId: number | undefined,
  options?: { enabled?: boolean }
) {
  // Fetch token metadata (symbol, decimals) separately
  // This is cached and reused across all balance queries for this token
  const {
    data: metadata,
    isLoading: isLoadingMetadata,
    error: metadataError,
  } = useTokenMetadata(chainId, tokenAddress, {
    enabled: options?.enabled ?? true,
  });

  // Fetch balance
  const {
    data: balanceData,
    isLoading: isLoadingBalance,
    error: balanceError,
    refetch,
  } = useQuery({
    queryKey: erc20BalanceQueryKeys.byTokenAndAddress(chainId!, tokenAddress!, userAddress!),
    queryFn: async () => {
      const balance = await fetchERC20Balance(tokenAddress!, userAddress!, chainId!);

      // Format using metadata if available
      if (metadata) {
        return {
          balance,
          formatted: formatERC20Balance(
            balance,
            metadata.symbol,
            metadata.decimals
          ),
        };
      }

      // Fallback formatting without metadata
      return {
        balance,
        formatted: balance.toString(),
      };
    },
    staleTime: BALANCE_STALE_TIME_MS,
    gcTime: BALANCE_GC_TIME_MS,
    enabled:
      chainId !== undefined &&
      !!tokenAddress &&
      tokenAddress.length === 42 && // Valid Ethereum address
      !!userAddress &&
      userAddress.length === 42 &&
      (options?.enabled ?? true) &&
      !!metadata, // Wait for metadata before fetching balance
    retry: 2,
  });

  return {
    balance: balanceData?.balance,
    formatted: balanceData?.formatted,
    symbol: metadata?.symbol,
    decimals: metadata?.decimals,
    isLoading: isLoadingMetadata || isLoadingBalance,
    error: metadataError || balanceError,
    refetch,
  };
}
