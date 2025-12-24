import { useQuery, useQueries } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { getNetworkConfigByChainId } from '@/lib/config/network-config';
import { CACHE_TIMES } from '@/lib/config/react-query-config';

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

// Minimal ERC20 ABI for metadata
const ERC20_METADATA_ABI = [
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
] as const;

/**
 * Fetch token metadata from ERC20 contract
 */
async function fetchTokenMetadata(
  chainId: number,
  tokenAddress: string
): Promise<TokenMetadata> {
  const networkConfig = await getNetworkConfigByChainId(chainId);

  if (!networkConfig?.rpc_url) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
  const contract = new ethers.Contract(tokenAddress, ERC20_METADATA_ABI, provider);

  const [name, symbol, decimals] = await Promise.all([
    contract.name(),
    contract.symbol(),
    contract.decimals(),
  ]);

  return {
    name,
    symbol,
    decimals: Number(decimals),
  };
}

/**
 * Query keys for token metadata
 */
export const tokenMetadataQueryKeys = {
  all: ['token-metadata'] as const,
  byToken: (chainId: number, tokenAddress: string) =>
    ['token-metadata', chainId, tokenAddress.toLowerCase()] as const,
};

/**
 * React Query hook: Fetch ERC20 token metadata (name, symbol, decimals)
 *
 * @param chainId - The chain ID where the token is deployed
 * @param tokenAddress - The token contract address
 * @param options - React Query options
 *
 * Benefits: Auto-caching, deduplication, loading states
 */
export function useTokenMetadata(
  chainId: number | undefined,
  tokenAddress: string | undefined | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: tokenMetadataQueryKeys.byToken(chainId!, tokenAddress!),
    queryFn: () => fetchTokenMetadata(chainId!, tokenAddress!),
    staleTime: CACHE_TIMES.TOKEN_METADATA.STALE_TIME_MS,
    gcTime: CACHE_TIMES.TOKEN_METADATA.GARBAGE_COLLECTION_TIME_MS,
    enabled:
      chainId !== undefined &&
      !!tokenAddress &&
      tokenAddress !== '0x0000000000000000000000000000000000000000' &&
      (options?.enabled ?? true),
    retry: 2, // Retry failed requests
  });
}

/**
 * Hook to fetch metadata for multiple tokens on a chain
 * Returns a map of tokenAddress -> metadata
 */
export function useMultipleTokenMetadata(
  chainId: number | undefined,
  tokenAddresses: (string | null | undefined)[]
) {
  // Filter out null/undefined and native token (0x0)
  const validAddresses = tokenAddresses.filter(
    (addr): addr is string =>
      !!addr && addr !== '0x0000000000000000000000000000000000000000'
  );

  // Execute all queries in parallel using React Query's useQueries
  // This automatically handles deduplication and caching
  const results = useQueries({
    queries: validAddresses.map(address => ({
      queryKey: tokenMetadataQueryKeys.byToken(chainId!, address),
      queryFn: () => fetchTokenMetadata(chainId!, address),
      staleTime: CACHE_TIMES.TOKEN_METADATA.STALE_TIME_MS,
      gcTime: CACHE_TIMES.TOKEN_METADATA.GARBAGE_COLLECTION_TIME_MS,
      enabled: chainId !== undefined,
      retry: 2,
    })),
  });

  return {
    metadataMap: Object.fromEntries(
      validAddresses.map((address, index) => [
        address.toLowerCase(),
        results[index].data,
      ]).filter(([_, data]) => data !== undefined)
    ) as Record<string, TokenMetadata>,
    isLoading: results.some(r => r.isLoading),
    isError: results.some(r => r.isError),
  };
}
