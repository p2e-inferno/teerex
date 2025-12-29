import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers, EventLog } from 'ethers';
import { useNetworkConfigs } from './useNetworkConfigs';
import type { NetworkConfig as DbNetworkConfig } from '@/lib/config/network-config';

const PAGE_SIZE = 20;

// Conservative block range limits per network to avoid RPC errors
// Base: 10,000 max, Polygon: 2,000 safe, Ethereum: 2,000 safe
const NETWORK_BLOCK_LIMITS: Record<number, number> = {
  1: 800,       // Ethereum Mainnet - strict RPC limits (max 1k)
  8453: 5000,   // Base Mainnet - 10k max, use 5k for safety
  84532: 5000,  // Base Sepolia - same as Base Mainnet
  137: 5,       // Polygon Mainnet - extreme limit for Alchemy
  42220: 2000,  // Celo Mainnet - conservative
};

const DEFAULT_BLOCK_LIMIT = 2000; // Safe default for unknown networks

// Cache decimals to avoid repeated contract calls
const decimalsCache = new Map<string, number>();

/**
 * Get safe block range limit for a network
 */
function getBlockLimit(chainId: number): number {
  return NETWORK_BLOCK_LIMITS[chainId] || DEFAULT_BLOCK_LIMIT;
}

export interface TransactionRecord {
  hash: string;
  chainId: number;
  chainName: string;
  from: string;
  to: string;
  value: string; // Human-readable formatted amount
  tokenSymbol: string;
  tokenAddress: string;
  timestamp: number;
  blockNumber: number;
  explorerUrl: string;
  direction: 'sent' | 'received';
}

interface NetworkConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeSymbol: string;
  blockExplorerUrl: string | null;
}

/**
 * Synchronous helper to generate explorer transaction URL
 * Avoids async database lookups by using already-loaded config
 */
function buildExplorerTxUrl(blockExplorerUrl: string | null, txHash: string): string {
  if (!blockExplorerUrl) return txHash;
  const baseUrl = blockExplorerUrl.replace(/\/$/, '');
  return `${baseUrl}/tx/${txHash}`;
}

// Minimal ERC-20 ABI for Transfer events and decimals
const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
];

/**
 * Fetches transaction history for a given address across all active networks
 * Queries ERC-20 token transfers (USDC, DG, G, UP)
 */
async function fetchTransactionHistory(
  address: string,
  networks: NetworkConfig[],
  dbNetworks: DbNetworkConfig[]
): Promise<TransactionRecord[]> {
  const allTransactions: TransactionRecord[] = [];
  const processedHashes = new Set<string>(); // Deduplication by hash + token

  // Process each network in parallel
  await Promise.all(
    networks.map(async (network) => {
      try {
        const dbNetwork = dbNetworks.find((n) => n.chain_id === network.chainId);
        if (!dbNetwork) return;

        const provider = new ethers.JsonRpcProvider(network.rpcUrl);
        const currentBlock = await provider.getBlockNumber();

        // Use network-specific block limit to avoid RPC errors
        const blockLimit = getBlockLimit(network.chainId);
        const fromBlock = Math.max(0, currentBlock - blockLimit);

        // Fetch ERC-20 token transfers
        const tokenSymbols: Array<'USDC' | 'DG' | 'G' | 'UP'> = ['USDC', 'DG', 'G', 'UP'];

        for (const symbol of tokenSymbols) {
          const tokenAddress = getTokenAddressFromNetwork(dbNetwork, symbol);
          if (!tokenAddress) continue; // Skip if token not configured on this network

          const tokenTransactions = await fetchERC20Transfers(
            provider,
            address,
            network,
            { symbol, address: tokenAddress },
            fromBlock,
            currentBlock,
            processedHashes
          );
          allTransactions.push(...tokenTransactions);
        }
      } catch (error) {
        console.error(`Error fetching transactions for ${network.chainName}:`, error);
        // Continue with other networks even if one fails
      }
    })
  );

  // Sort by timestamp descending (newest first)
  return allTransactions.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Helper to get token address from network config
 */
function getTokenAddressFromNetwork(
  network: DbNetworkConfig,
  symbol: 'USDC' | 'DG' | 'G' | 'UP'
): string | null {
  switch (symbol) {
    case 'USDC': return network.usdc_token_address;
    case 'DG': return network.dg_token_address;
    case 'G': return network.g_token_address;
    case 'UP': return network.up_token_address;
    default: return null;
  }
}

/**
 * Fetches ERC-20 token transfers with optimized parallel block fetching
 */
async function fetchERC20Transfers(
  provider: ethers.JsonRpcProvider,
  address: string,
  network: NetworkConfig,
  tokenConfig: { symbol: string; address: string },
  fromBlock: number,
  toBlock: number,
  processedHashes: Set<string>
): Promise<TransactionRecord[]> {
  const transactions: TransactionRecord[] = [];

  try {
    const contract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);

    // Get decimals from cache or contract
    let decimals = decimalsCache.get(tokenConfig.address.toLowerCase()) ?? 18;
    if (!decimalsCache.has(tokenConfig.address.toLowerCase())) {
      try {
        decimals = await contract.decimals();
        decimalsCache.set(tokenConfig.address.toLowerCase(), decimals);
      } catch {
        console.warn(`Could not fetch decimals for ${tokenConfig.symbol} on ${network.chainName}, using 18`);
        decimalsCache.set(tokenConfig.address.toLowerCase(), 18);
      }
    }

    // Use explicit toBlock passed from parent to ensure strict range compliance
    // const toBlock = await provider.getBlockNumber(); // REMOVED to prevent race condition

    // Query both sent and received transfers
    const sentFilter = contract.filters.Transfer(address, null);
    const receivedFilter = contract.filters.Transfer(null, address);

    const [sentEvents, receivedEvents] = await Promise.all([
      contract.queryFilter(sentFilter, fromBlock, toBlock),
      contract.queryFilter(receivedFilter, fromBlock, toBlock),
    ]);

    // Filter to EventLogs only and remove duplicates
    const allLogs = [...sentEvents, ...receivedEvents]
      .filter((log): log is EventLog => log instanceof EventLog)
      .filter((log) => {
        const dedupeKey = `${log.transactionHash}-${tokenConfig.address}`;
        if (processedHashes.has(dedupeKey)) return false;
        processedHashes.add(dedupeKey);
        return true;
      });

    if (allLogs.length === 0) return transactions;

    // OPTIMIZATION: Batch fetch all unique blocks in parallel
    const uniqueBlockNumbers = [...new Set(allLogs.map((log) => log.blockNumber))];
    const blockPromises = uniqueBlockNumbers.map((blockNumber) =>
      provider.getBlock(blockNumber).catch(() => null)
    );
    const blocks = await Promise.all(blockPromises);

    // Create a map for O(1) block lookups
    const blockMap = new Map(
      blocks
        .filter((block): block is ethers.Block => block !== null)
        .map((block) => [block.number, block])
    );

    // Process all events with pre-fetched block data
    for (const log of allLogs) {
      const block = blockMap.get(log.blockNumber);
      if (!block) continue; // Skip if block fetch failed

      // Determine direction based on whether this was in sent or received events
      const isSent = sentEvents.some(
        (e) => e instanceof EventLog && e.transactionHash === log.transactionHash
      );

      // Use synchronous explorer URL builder (no await needed)
      const explorerUrl = buildExplorerTxUrl(network.blockExplorerUrl, log.transactionHash);

      transactions.push({
        hash: log.transactionHash,
        chainId: network.chainId,
        chainName: network.chainName,
        from: log.args[0] as string,
        to: log.args[1] as string,
        value: ethers.formatUnits(log.args[2] as bigint, decimals),
        tokenSymbol: tokenConfig.symbol,
        tokenAddress: tokenConfig.address,
        timestamp: block.timestamp,
        blockNumber: log.blockNumber,
        explorerUrl,
        direction: isSent ? 'sent' : 'received',
      });
    }
  } catch (error: any) {
    // Provide helpful error messages for common RPC issues
    if (error?.message?.includes('range') || error?.code === -32614 || error?.code === -32062) {
      console.error(
        `Block range error for ${tokenConfig.symbol} on ${network.chainName}:`,
        `Attempted ${fromBlock} to ${toBlock}. Consider reducing NETWORK_BLOCK_LIMITS for chain ${network.chainId}.`,
        error.message
      );
    } else {
      console.error(`Error fetching ${tokenConfig.symbol} transfers for ${network.chainName}:`, error);
    }
  }

  return transactions;
}

/**
 * Hook for fetching and paginating transaction history with React Query
 * Features infinite scroll pagination and caching to minimize RPC calls
 */
export function useTransactionHistory(address: string | undefined) {
  const { networks: dbNetworks } = useNetworkConfigs();
  const [displayedTransactions, setDisplayedTransactions] = useState<TransactionRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const allTxCache = useRef<TransactionRecord[]>([]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Prepare network configs (filter out networks with no RPC URL)
  const networks: NetworkConfig[] = (dbNetworks || [])
    .filter((network) => network.rpc_url !== null)
    .map((network) => ({
      chainId: network.chain_id,
      chainName: network.chain_name,
      rpcUrl: network.rpc_url!,
      nativeSymbol: network.native_currency_symbol,
      blockExplorerUrl: network.block_explorer_url,
    }));

  // React Query for fetching transactions
  const {
    data: allTransactions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['transaction-history', address, networks.map((n) => n.chainId).join(',')],
    queryFn: () => fetchTransactionHistory(address!, networks, dbNetworks || []),
    staleTime: 5 * 60 * 1000, // 5 minutes - data rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
    enabled: !!address && networks.length > 0,
    retry: 2, // Retry failed RPC calls
    refetchOnWindowFocus: false, // Don't hammer RPC on tab switch
  });

  // Initialize cache and displayed transactions when data loads
  useEffect(() => {
    if (allTransactions) {
      allTxCache.current = allTransactions;
      setDisplayedTransactions(allTransactions.slice(0, PAGE_SIZE));
      setCurrentPage(0);
    }
  }, [allTransactions]);

  // Load more transactions
  const loadMore = useCallback(() => {
    if (isLoadingMore) return;

    const nextPage = currentPage + 1;
    const startIndex = 0;
    const endIndex = (nextPage + 1) * PAGE_SIZE;
    const nextBatch = allTxCache.current.slice(startIndex, endIndex);

    if (nextBatch.length > displayedTransactions.length) {
      setIsLoadingMore(true);

      // Simulate slight delay for UX (shows loading indicator)
      setTimeout(() => {
        setDisplayedTransactions(nextBatch);
        setCurrentPage(nextPage);
        setIsLoadingMore(false);
      }, 300);
    }
  }, [currentPage, displayedTransactions.length, isLoadingMore]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [loadMore, isLoadingMore, isLoading]);

  const hasMore = displayedTransactions.length < allTxCache.current.length;

  return {
    transactions: displayedTransactions,
    isLoading,
    isLoadingMore,
    hasMore,
    error: error as Error | null,
    refetch,
    loadMoreRef,
  };
}
