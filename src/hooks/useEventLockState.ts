/**
 * Phase 1: Hook to detect pricing mismatches between database and on-chain lock state
 *
 * This hook queries the on-chain lock contract and compares pricing with database values.
 * It detects mismatches in price, currency, or both, and provides a refetch mechanism.
 *
 * Features:
 * - Automatic on-chain pricing query with React Query caching (5-minute stale time)
 * - Mismatch detection (price, currency, or both)
 * - Manual refetch capability
 * - Error handling with user-friendly messages
 * - Query disabling for FREE events or missing lock addresses
 */

import { useQuery } from '@tanstack/react-query';
import * as lockUtils from '@/utils/lockUtils';

export interface LockPricingState {
  // On-chain data
  onChainPrice: number | null;
  onChainCurrency: string | null;
  onChainTokenAddress: string | null;

  // Mismatch detection
  hasMismatch: boolean;
  mismatchType: 'none' | 'price' | 'currency' | 'both';

  // Query state
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
}

interface UseEventLockStateParams {
  lockAddress: string | undefined;
  chainId: number | undefined;
  dbPrice: number | undefined;
  dbCurrency: string | undefined;
  enabled?: boolean;
}

/**
 * Hook to check if event pricing matches on-chain lock state
 *
 * @param params - Hook parameters including lock address, chain ID, and database pricing
 * @returns Lock pricing state with mismatch detection
 */
export function useEventLockState({
  lockAddress,
  chainId,
  dbPrice,
  dbCurrency,
  enabled = true,
}: UseEventLockStateParams): LockPricingState {
  // Query on-chain pricing
  const {
    data: onChainData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['event-lock-state', lockAddress, chainId],
    queryFn: async () => {
      if (!lockAddress || !chainId) {
        throw new Error('Missing lock address or chain ID');
      }

      return await lockUtils.getOnChainLockPricing(lockAddress, chainId);
    },
    enabled:
      enabled &&
      !!lockAddress &&
      lockAddress !== 'Unknown' &&
      !!chainId &&
      dbCurrency !== 'FREE' && // Skip for FREE events (expected mismatch)
      dbCurrency !== 'NGN', // Skip for fiat events
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Detect mismatches
  const hasPriceMismatch =
    onChainData && dbPrice !== undefined && onChainData.price !== dbPrice;

  const hasCurrencyMismatch =
    onChainData && dbCurrency && onChainData.currency !== dbCurrency;

  const hasMismatch = !!(hasPriceMismatch || hasCurrencyMismatch);

  let mismatchType: 'none' | 'price' | 'currency' | 'both' = 'none';
  if (hasPriceMismatch && hasCurrencyMismatch) {
    mismatchType = 'both';
  } else if (hasPriceMismatch) {
    mismatchType = 'price';
  } else if (hasCurrencyMismatch) {
    mismatchType = 'currency';
  }

  return {
    onChainPrice: onChainData?.price ?? null,
    onChainCurrency: onChainData?.currency ?? null,
    onChainTokenAddress: onChainData?.tokenAddress ?? null,
    hasMismatch,
    mismatchType,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
