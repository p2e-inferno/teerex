import { useMemo } from 'react';
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { ethers, EventLog } from 'ethers';
import { useNetworkConfigs } from './useNetworkConfigs';
import type { NetworkConfig as DbNetworkConfig } from '@/lib/config/network-config';

const PAGE_BLOCK_SIZE = 500;
const LOG_CHUNK_SIZE = 10;
const THROTTLE_MS = 20; // 20ms delay between chunks (50 calls = 1s per page)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type TransactionRange = '1h' | '12h' | '1d' | '7d' | '30d';

const RANGE_SECONDS: Record<TransactionRange, number> = {
  '1h': 60 * 60,
  '12h': 12 * 60 * 60,
  '1d': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
};

const AVG_BLOCK_TIME_SECONDS: Record<number, number> = {
  1: 12,      // Ethereum Mainnet
  8453: 2,    // Base Mainnet
  84532: 2,   // Base Sepolia
  137: 2,     // Polygon Mainnet
  42220: 5,   // Celo Mainnet
};

const DEFAULT_BLOCK_TIME_SECONDS = 12;

// Cache decimals to avoid repeated contract calls
const decimalsCache = new Map<string, number>();

function getRangeBlockCount(chainId: number, range: TransactionRange): number {
  const avgBlockTime = AVG_BLOCK_TIME_SECONDS[chainId] || DEFAULT_BLOCK_TIME_SECONDS;
  return Math.max(1, Math.ceil(RANGE_SECONDS[range] / avgBlockTime));
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

interface TransactionHistoryPage {
  transactions: TransactionRecord[];
  hasMore: boolean;
  anchors: Record<number, number>;
}

interface TransactionHistoryPageParam {
  pageIndex: number;
  anchors?: Record<number, number>;
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
 * Fetches a single block window of transaction history for a given address
 * Queries ERC-20 token transfers (USDC, DG, G, UP)
 */
async function fetchTransactionHistoryPage(
  address: string,
  networks: NetworkConfig[],
  dbNetworks: DbNetworkConfig[],
  range: TransactionRange,
  pageIndex: number,
  anchors?: Record<number, number>
): Promise<TransactionHistoryPage> {
  const allTransactions: TransactionRecord[] = [];
  const processedHashes = new Set<string>(); // Deduplication by hash + token
  let hasMore = false;
  const resolvedAnchors: Record<number, number> = anchors ? { ...anchors } : {};

  // Process each network in parallel
  await Promise.all(
    networks.map(async (network) => {
      try {
        const dbNetwork = dbNetworks.find((n) => n.chain_id === network.chainId);
        if (!dbNetwork) return;

        const provider = new ethers.JsonRpcProvider(network.rpcUrl);
        const anchorBlock =
          resolvedAnchors[network.chainId] ?? (await provider.getBlockNumber());
        resolvedAnchors[network.chainId] = anchorBlock;

        const rangeBlockCount = getRangeBlockCount(network.chainId, range);
        const rangeStart = Math.max(0, anchorBlock - rangeBlockCount + 1);
        const pageEnd = anchorBlock - pageIndex * PAGE_BLOCK_SIZE;
        const pageStart = Math.max(rangeStart, pageEnd - PAGE_BLOCK_SIZE + 1);

        if (pageEnd < rangeStart || pageStart > pageEnd) return;
        if (pageStart > rangeStart) hasMore = true;

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
            pageStart,
            pageEnd,
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
  return {
    transactions: allTransactions.sort((a, b) => b.timestamp - a.timestamp),
    hasMore,
    anchors: resolvedAnchors,
  };
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

    const sentEvents: EventLog[] = [];
    const receivedEvents: EventLog[] = [];

    for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
      const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);

      try {
        if (start > fromBlock) {
          await sleep(THROTTLE_MS);
        }

        const [sentChunk, receivedChunk] = await Promise.all([
          contract.queryFilter(sentFilter, start, end),
          contract.queryFilter(receivedFilter, start, end),
        ]);

        sentEvents.push(...(sentChunk.filter((log): log is EventLog => log instanceof EventLog)));
        receivedEvents.push(...(receivedChunk.filter((log): log is EventLog => log instanceof EventLog)));
      } catch (chunkError: any) {
        if (
          chunkError?.message?.includes('range') ||
          chunkError?.code === -32614 ||
          chunkError?.code === -32062
        ) {
          console.error(
            `Block range error for ${tokenConfig.symbol} on ${network.chainName}:`,
            `Attempted ${start} to ${end}.`,
            chunkError.message
          );
          break;
        }

        console.error(
          `Error fetching ${tokenConfig.symbol} transfers for ${network.chainName} (blocks ${start}-${end}):`,
          chunkError
        );
      }
    }

    // Filter to EventLogs only and remove duplicates
    const allLogs = [...sentEvents, ...receivedEvents].filter((log) => {
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
        `Attempted ${fromBlock} to ${toBlock}. Consider reducing the selected range or page size for chain ${network.chainId}.`,
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
 * Uses block-window pagination to keep RPC calls within provider limits
 *
 * @param address - User wallet address
 * @param range - Time range for transaction history
 * @param chainId - Optional chain ID to filter transactions to a specific network
 */
export function useTransactionHistory(
  address: string | undefined,
  range: TransactionRange,
  chainId?: number
) {
  const { networks: dbNetworks } = useNetworkConfigs();

  // Prepare network configs (filter out networks with no RPC URL)
  // If chainId is provided, only query that specific network
  const networks: NetworkConfig[] = useMemo(() => {
    const filtered = (dbNetworks || [])
      .filter((network) => network.rpc_url !== null)
      .filter((network) => !chainId || network.chain_id === chainId)
      .map((network) => ({
        chainId: network.chain_id,
        chainName: network.chain_name,
        rpcUrl: network.rpc_url!,
        nativeSymbol: network.native_currency_symbol,
        blockExplorerUrl: network.block_explorer_url,
      }));



    return filtered;
  }, [dbNetworks, chainId]);

  // React Query for fetching transactions
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    TransactionHistoryPage,
    Error,
    InfiniteData<TransactionHistoryPage, TransactionHistoryPageParam>,
    (string | undefined | number)[],
    TransactionHistoryPageParam
  >({
    queryKey: ['transaction-history', address, networks.map((n) => n.chainId).join(','), range, chainId],
    initialPageParam: { pageIndex: 0, anchors: undefined },
    queryFn: ({ pageParam }) =>
      fetchTransactionHistoryPage(
        address!,
        networks,
        dbNetworks || [],
        range,
        pageParam.pageIndex,
        pageParam.anchors
      ),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? { pageIndex: pages.length, anchors: lastPage.anchors } : undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes - data rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
    enabled: !!address && networks.length > 0,
    retry: 2, // Retry failed RPC calls
    refetchOnWindowFocus: false, // Don't hammer RPC on tab switch
  });

  const transactions: TransactionRecord[] = useMemo(() => {
    if (!data?.pages) return [];
    const allTransactions = data.pages.flatMap((page) => page.transactions);
    return allTransactions.sort((a, b) => b.timestamp - a.timestamp);
  }, [data]);

  const canFetchMore = !!hasNextPage && !isFetchingNextPage && !isLoading;
  const hasMore = !!hasNextPage;

  return {
    transactions,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore,
    error: error as Error | null,
    refetch,
    fetchNextPage,
    canFetchMore,
    range,
  };
}
