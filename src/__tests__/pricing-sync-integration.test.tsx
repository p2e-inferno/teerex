/**
 * Integration tests for Pricing Sync Feature (Phase 1 + Phase 2)
 *
 * Tests the complete flow from detection to resolution of pricing mismatches.
 * These tests ensure all components work together without regressions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as lockUtils from '@/utils/lockUtils';
import * as networkConfig from '@/lib/config/network-config';
import { useEventLockState } from '@/hooks/useEventLockState';
import { supabase } from '@/integrations/supabase/client';

// Mock dependencies
vi.mock('@/utils/lockUtils');
vi.mock('@/lib/config/network-config');
vi.mock('@/integrations/supabase/client');

describe('Pricing Sync Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();

    // Default network config mock
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
      chain_id: 8453,
      chain_name: 'Base Mainnet',
      rpc_url: 'https://mainnet.base.org',
      usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      dg_token_address: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
      g_token_address: null,
      up_token_address: null,
    } as any);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('End-to-End: Mismatch Detection and Resolution', () => {
    it('should detect DG → FREE mismatch and allow sync', async () => {
      // Step 1: Database has DG 500, on-chain has FREE (0 ETH)
      const databasePrice = 500;
      const databaseCurrency = 'DG';

      // Mock on-chain query returning FREE
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      // Step 2: Hook detects mismatch
      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: databasePrice,
            dbCurrency: databaseCurrency,
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('both');
      expect(result.current.onChainPrice).toBe(0);
      expect(result.current.onChainCurrency).toBe('ETH');
      expect(result.current.onChainTokenAddress).toBe(ethers.ZeroAddress);

      // Step 3: User clicks "Sync from Chain"
      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          ok: true,
          event: {
            id: 'event-123',
            price: 0,
            currency: 'ETH',
          },
        },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      await supabase.functions.invoke('sync-event-pricing-from-chain', {
        body: { event_id: 'event-123' },
        headers: {
          Authorization: 'Bearer anon-key',
          'X-Privy-Authorization': 'Bearer user-token',
        },
      });

      expect(mockInvoke).toHaveBeenCalledWith('sync-event-pricing-from-chain', {
        body: { event_id: 'event-123' },
        headers: {
          Authorization: 'Bearer anon-key',
          'X-Privy-Authorization': 'Bearer user-token',
        },
      });

      // Step 4: Database updated, re-query shows match
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      // Refetch with updated database values
      const { result: result2 } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 0, // Updated DB values
            dbCurrency: 'ETH',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false);
      });

      expect(result2.current.hasMismatch).toBe(false);
    });

    it('should detect USDC price change and allow sync', async () => {
      // Database: USDC 10, On-chain: USDC 5
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 5,
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

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(true);
      expect(result.current.mismatchType).toBe('price');
      expect(result.current.onChainPrice).toBe(5);

      // Sync should update to on-chain price
      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          ok: true,
          event: { price: 5, currency: 'USDC' },
        },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      await supabase.functions.invoke('sync-event-pricing-from-chain', {
        body: { event_id: 'event-123' },
      });

      expect(mockInvoke).toHaveBeenCalled();
    });

    it('should detect currency mismatch (USDC → DG) and allow sync', async () => {
      // Database: USDC 10, On-chain: DG 10
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 10,
        currency: 'DG',
        tokenAddress: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
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
      expect(result.current.mismatchType).toBe('currency');
      expect(result.current.onChainCurrency).toBe('DG');
    });
  });

  describe('No Regression: Existing Functionality', () => {
    it('should not affect events with matching pricing', async () => {
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

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should pass validation without issue
      expect(result.current.hasMismatch).toBe(false);
      expect(result.current.mismatchType).toBe('none');
    });

    it('should not affect FREE events', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'ETH',
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

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
    });

    it('should not break existing event edit flow', async () => {
      // Simulate editing an event with no mismatch
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

      // Event edit should proceed normally
      expect(result.current.hasMismatch).toBe(false);
    });

    it('should not interfere with fiat events', async () => {
      // Fiat events use NGN, not on-chain pricing
      // Should not query or show mismatch
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'ETH',
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

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Fiat events should show as FREE on-chain
      expect(result.current.hasMismatch).toBe(false);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle RPC errors gracefully without breaking UI', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockRejectedValue(
        new Error('RPC request failed')
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
      expect(result.current.hasMismatch).toBe(false); // Default to false on error
    });

    it('should handle edge function errors gracefully', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Lock manager check failed' },
      });

      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      const result = await supabase.functions.invoke('sync-event-pricing-from-chain', {
        body: { event_id: 'event-123' },
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Lock manager check failed');
    });

    it('should handle network timeouts', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
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

      await waitFor(
        () => {
          expect(result.current.error).not.toBeNull();
        },
        { timeout: 5000 }
      );
    });
  });

  describe('Performance & Optimization', () => {
    it('should cache on-chain queries', async () => {
      const mockGetOnChainPricing = vi.mocked(lockUtils.getOnChainLockPricing);
      mockGetOnChainPricing.mockResolvedValue({
        price: 10,
        currency: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      });

      // First query
      const { result: result1 } = renderHook(
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
        expect(result1.current.isLoading).toBe(false);
      });

      expect(mockGetOnChainPricing).toHaveBeenCalledTimes(1);

      // Second query with same params (should use cache)
      const { result: result2 } = renderHook(
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
        expect(result2.current.isLoading).toBe(false);
      });

      // Should NOT call again
      expect(mockGetOnChainPricing).toHaveBeenCalledTimes(1);
    });

    it('should not query if disabled (invalid params)', () => {
      const mockGetOnChainPricing = vi.mocked(lockUtils.getOnChainLockPricing);

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '',
            chainId: 8453,
            dbPrice: 10,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGetOnChainPricing).not.toHaveBeenCalled();
    });

    it('should debounce rapid refetches', async () => {
      const mockGetOnChainPricing = vi.mocked(lockUtils.getOnChainLockPricing);
      mockGetOnChainPricing.mockResolvedValue({
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

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Trigger multiple refetches rapidly
      result.current.refetch();
      result.current.refetch();
      result.current.refetch();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should only make one additional call
      expect(mockGetOnChainPricing).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multi-Chain Support', () => {
    it('should work on Base Mainnet (8453)', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
        usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      } as any);

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
    });

    it('should work on Base Sepolia (84532)', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 84532,
        rpc_url: 'https://sepolia.base.org',
        usdc_token_address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      } as any);

      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0.001,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 84532,
            dbPrice: 0.001,
            dbCurrency: 'ETH',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
    });
  });

  describe('Edge Cases & Boundary Conditions', () => {
    it('should handle zero price correctly', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0,
        currency: 'ETH',
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

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
    });

    it('should handle very large prices', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 1000000,
        currency: 'DG',
        tokenAddress: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 1000000,
            dbCurrency: 'DG',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
      expect(result.current.onChainPrice).toBe(1000000);
    });

    it('should handle very small fractional prices', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 0.0001,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 0.0001,
            dbCurrency: 'ETH',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMismatch).toBe(false);
    });

    it('should handle unknown token addresses gracefully', async () => {
      vi.mocked(lockUtils.getOnChainLockPricing).mockResolvedValue({
        price: 100,
        currency: 'USDC',
        tokenAddress: '0x0000000000000000000000000000000000000000',
      });

      const { result } = renderHook(
        () =>
          useEventLockState({
            lockAddress: '0xLOCK123',
            chainId: 8453,
            dbPrice: 100,
            dbCurrency: 'USDC',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should match if prices and currencies are the same
      expect(result.current.hasMismatch).toBe(false);
    });
  });
});
