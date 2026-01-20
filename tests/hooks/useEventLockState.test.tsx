/**
 * Tests for useEventLockState hook (Phase 1: Detection)
 *
 * This hook queries on-chain lock state and compares with database values
 * to detect pricing/currency mismatches.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEventLockState } from '../useEventLockState';
import { ethers } from 'ethers';
import * as lockUtils from '@/utils/lockUtils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dependencies
vi.mock('@/utils/lockUtils');
vi.mock('@/lib/config/network-config');

describe('useEventLockState', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('No Mismatch Scenarios', () => {
    it('should detect no mismatch for matching USDC price', async () => {
      // Mock on-chain query returning 10 USDC
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 10,
        currency: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasMismatch).toBe(false);

      // Wait for query to resolve
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
      expect(result.current.mismatchType).toBe('none');
      expect(result.current.onChainPrice).toBe(10);
      expect(result.current.onChainCurrency).toBe('USDC');
      expect(result.current.onChainTokenAddress).toBe(
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      );
    });

    it('should detect no mismatch for matching ETH price', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0.01,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 0.01,
            dbCurrency: 'ETH',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
      expect(result.current.mismatchType).toBe('none');
    });

    it('should detect no mismatch for matching DG price', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 500,
        currency: 'DG',
        tokenAddress: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 500,
            dbCurrency: 'DG',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
      expect(result.current.mismatchType).toBe('none');
    });
  });

  describe('Mismatch Scenarios', () => {
    it('should detect price mismatch for ETH event', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0.01,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 0.02,
            dbCurrency: 'ETH',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('price');
      expect(result.current.onChainPrice).toBe(0.01);
      expect(result.current.onChainCurrency).toBe('ETH');
    });

    it('should detect currency mismatch (DG → FREE)', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'FREE',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 500,
            dbCurrency: 'DG',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('currency');
      expect(result.current.onChainPrice).toBe(0);
      expect(result.current.onChainCurrency).toBe('FREE');
    });

    it('should detect both price and currency mismatch', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'FREE',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('both');
    });

    it('should detect price mismatch for USDC event', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 10,
        currency: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 20,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('price');
    });

    it('should detect currency mismatch (USDC → ETH)', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0.01,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('both');
    });

    it('should detect both mismatches for DG → USDC change', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 10,
        currency: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 500,
            dbCurrency: 'DG',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('both');
    });
  });

  describe('Query Control', () => {
    it('should skip query for FREE events', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'FREE',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 0,
            dbCurrency: 'FREE',
          }),
        { wrapper }
      );

      // Should not be loading for FREE events
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should skip query when lock address is Unknown', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'FREE',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: 'Unknown',
            chainId: 8453,
            dbPrice: 0,
            dbCurrency: 'FREE',
          }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should skip query when chain ID is missing', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'FREE',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: undefined,
            dbPrice: 0,
            dbCurrency: 'FREE',
          }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
    });

    it('should allow manual refetch', async () => {
      let callCount = 0;
      vi.mocked(lockUtils.getOnChainLockPricing).mockImplementation(async () => {
        callCount++;
        return {
          price: callCount * 10,
          currency: 'USDC',
          tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        };
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.onChainPrice).toBe(10);

      // Trigger refetch
      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.onChainPrice).toBe(20);
      });
    });

    it('should handle query errors gracefully', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.message).toBe('Network error');
    });

    it('should have proper loading state during query', async () => {
      let resolveQuery: any;
      const queryPromise = new Promise((resolve) => {
        resolveQuery = resolve;
      });

      vi.mocked(lockUtils.getOnChainLockPricing).mockReturnValue(
        queryPromise as any
      );

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      // Should be loading initially
      expect(result.current.isLoading).toBe(true);

      // Resolve the query
      resolveQuery({
        price: 10,
        currency: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should allow disabling query with enabled flag', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 10,
        currency: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
            enabled: false,
          }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
    });
  });
});
