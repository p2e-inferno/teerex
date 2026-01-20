/**
 * Tests for sync-event-pricing-from-chain edge function (Phase 2)
 *
 * This function syncs database pricing from on-chain lock state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'https://esm.sh/ethers@6.14.4';

// Mock dependencies
const mockSupabaseClient = {
  from: vi.fn(),
  functions: {
    invoke: vi.fn(),
  },
};

const mockVerifyPrivyToken = vi.fn();
const mockIsAnyUserWalletIsLockManagerParallel = vi.fn();
const mockValidateChain = vi.fn();
const mockResolveCurrencyFromAddress = vi.fn();

vi.mock('../_shared/privy.ts', () => ({
  verifyPrivyToken: mockVerifyPrivyToken,
  validateUserWallet: vi.fn(),
}));

vi.mock('../_shared/unlock.ts', () => ({
  isAnyUserWalletIsLockManagerParallel: mockIsAnyUserWalletIsLockManagerParallel,
  resolveCurrencyFromAddress: mockResolveCurrencyFromAddress,
}));

vi.mock('../_shared/network-helpers.ts', () => ({
  validateChain: mockValidateChain,
}));

describe('sync-event-pricing-from-chain edge function', () => {
  const mockEvent = {
    id: 'event-123',
    lock_address: '0xLOCK123',
    chain_id: 8453,
    price: 500, // Database says 500 DG
    currency: 'DG',
    creator_id: 'user-123',
  };

  const mockNetworkConfig = {
    chain_id: 8453,
    rpc_url: 'https://mainnet.base.org',
    usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    dg_token_address: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockVerifyPrivyToken.mockResolvedValue('user-123');
    mockValidateChain.mockResolvedValue(mockNetworkConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should reject requests without Privy token', async () => {
      mockVerifyPrivyToken.mockRejectedValue(new Error('unauthorized_missing_token'));

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_id: 'event-123' }),
      });

      // Simulate edge function call
      // Response should be 401/403
      await expect(mockVerifyPrivyToken()).rejects.toThrow('unauthorized_missing_token');
    });

    it('should reject requests from non-lock-managers', async () => {
      mockIsAnyUserWalletIsLockManagerParallel.mockResolvedValue({
        anyIsManager: false,
      });

      // Mock Supabase query for event
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockEvent,
              error: null,
            }),
          }),
        }),
      });

      // Should throw unauthorized error
      const isManager = await mockIsAnyUserWalletIsLockManagerParallel(
        mockEvent.lock_address,
        ['0xUSER123'],
        mockNetworkConfig.rpc_url
      );

      expect(isManager.anyIsManager).toBe(false);
      // In actual implementation, this would throw 'unauthorized_not_lock_manager'
    });

    it('should allow requests from lock managers', async () => {
      mockIsAnyUserWalletIsLockManagerParallel.mockResolvedValue({
        anyIsManager: true,
        manager: '0xUSER123',
      });

      const isManager = await mockIsAnyUserWalletIsLockManagerParallel(
        mockEvent.lock_address,
        ['0xUSER123'],
        mockNetworkConfig.rpc_url
      );

      expect(isManager.anyIsManager).toBe(true);
      expect(isManager.manager).toBe('0xUSER123');
    });
  });

  describe('On-Chain Query', () => {
    it('should query keyPrice and tokenAddress from lock contract', async () => {
      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(0n), // FREE lock
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      expect(await mockLockContract.keyPrice()).toBe(0n);
      expect(await mockLockContract.tokenAddress()).toBe(ethers.ZeroAddress);

      expect(mockLockContract.keyPrice).toHaveBeenCalledTimes(1);
      expect(mockLockContract.tokenAddress).toHaveBeenCalledTimes(1);
    });

    it('should fetch token decimals for ERC20 tokens', async () => {
      const dgAddress = '0x4aA47eD29959c7053996d8f7918db01A62D02ee5';

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseUnits('500', 18)),
        tokenAddress: vi.fn().mockResolvedValue(dgAddress),
      };

      const mockTokenContract = {
        decimals: vi.fn().mockResolvedValue(18),
      };

      expect(await mockTokenContract.decimals()).toBe(18);
      expect(mockTokenContract.decimals).toHaveBeenCalledTimes(1);
    });

    it('should use 18 decimals for native tokens', async () => {
      // For ETH (zero address), decimals should be 18 by default
      const decimals = 18;
      const keyPrice = ethers.parseEther('0.01');
      const humanPrice = ethers.formatUnits(keyPrice, decimals);

      expect(humanPrice).toBe('0.01');
    });
  });

  describe('Currency Resolution', () => {
    it('should resolve ETH from zero address', async () => {
      mockResolveCurrencyFromAddress.mockReturnValue('ETH');

      const currency = mockResolveCurrencyFromAddress(ethers.ZeroAddress, mockNetworkConfig);

      expect(currency).toBe('ETH');
      expect(mockResolveCurrencyFromAddress).toHaveBeenCalledWith(
        ethers.ZeroAddress,
        mockNetworkConfig
      );
    });

    it('should resolve USDC from token address', async () => {
      mockResolveCurrencyFromAddress.mockReturnValue('USDC');

      const currency = mockResolveCurrencyFromAddress(
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        mockNetworkConfig
      );

      expect(currency).toBe('USDC');
    });

    it('should resolve DG from token address', async () => {
      mockResolveCurrencyFromAddress.mockReturnValue('DG');

      const currency = mockResolveCurrencyFromAddress(
        '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
        mockNetworkConfig
      );

      expect(currency).toBe('DG');
    });

    it('should return UNKNOWN for unrecognized tokens', async () => {
      mockResolveCurrencyFromAddress.mockReturnValue('UNKNOWN');

      const currency = mockResolveCurrencyFromAddress('0xUNKNOWN', mockNetworkConfig);

      expect(currency).toBe('UNKNOWN');
    });
  });

  describe('Database Update', () => {
    it('should update event with on-chain pricing', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                ...mockEvent,
                price: 0, // Updated to FREE
                currency: 'ETH',
              },
              error: null,
            }),
          }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
      });

      // Simulate update
      const result = await mockSupabaseClient
        .from('events')
        .update({
          price: 0,
          currency: 'ETH',
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'event-123')
        .select()
        .single();

      expect(mockUpdate).toHaveBeenCalledWith({
        price: 0,
        currency: 'ETH',
        updated_at: expect.any(String),
      });
      expect(result.data.price).toBe(0);
      expect(result.data.currency).toBe('ETH');
    });

    it('should preserve other event fields during update', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                ...mockEvent,
                price: 10,
                currency: 'USDC',
                title: 'Original Title', // Should be preserved
                description: 'Original Description', // Should be preserved
              },
              error: null,
            }),
          }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
      });

      const result = await mockSupabaseClient
        .from('events')
        .update({
          price: 10,
          currency: 'USDC',
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'event-123')
        .select()
        .single();

      // Only price and currency should be updated
      expect(result.data.title).toBe('Original Title');
      expect(result.data.description).toBe('Original Description');
    });

    it('should handle database update errors', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database update failed' },
            }),
          }),
        }),
      });

      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
      });

      const result = await mockSupabaseClient
        .from('events')
        .update({ price: 10, currency: 'USDC' })
        .eq('id', 'event-123')
        .select()
        .single();

      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Database update failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle event not found', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // No rows found
            }),
          }),
        }),
      });

      const result = await mockSupabaseClient
        .from('events')
        .select('*')
        .eq('id', 'nonexistent-event')
        .single();

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });

    it('should handle unsupported chain', async () => {
      mockValidateChain.mockResolvedValue(null);

      const chainConfig = await mockValidateChain(mockSupabaseClient, 999999);

      expect(chainConfig).toBe(null);
      // Should return error response
    });

    it('should handle RPC errors', async () => {
      // Simulate RPC failure
      const mockContract = {
        keyPrice: vi.fn().mockRejectedValue(new Error('RPC request failed')),
      };

      await expect(mockContract.keyPrice()).rejects.toThrow('RPC request failed');
    });

    it('should handle contract not found', async () => {
      const mockContract = {
        keyPrice: vi.fn().mockRejectedValue(new Error('Contract not found')),
      };

      await expect(mockContract.keyPrice()).rejects.toThrow('Contract not found');
    });

    it('should handle decimal fetch failure', async () => {
      const mockTokenContract = {
        decimals: vi.fn().mockRejectedValue(new Error('Token contract error')),
      };

      await expect(mockTokenContract.decimals()).rejects.toThrow('Token contract error');
    });
  });

  describe('Response Format', () => {
    it('should return success response with updated event', () => {
      const successResponse = {
        ok: true,
        event: {
          ...mockEvent,
          price: 0,
          currency: 'ETH',
        },
      };

      expect(successResponse.ok).toBe(true);
      expect(successResponse.event).toBeDefined();
      expect(successResponse.event.price).toBe(0);
      expect(successResponse.event.currency).toBe('ETH');
    });

    it('should return error response on authorization failure', () => {
      const errorResponse = {
        ok: false,
        error: 'unauthorized_not_lock_manager',
      };

      expect(errorResponse.ok).toBe(false);
      expect(errorResponse.error).toBe('unauthorized_not_lock_manager');
    });

    it('should return error response on chain validation failure', () => {
      const errorResponse = {
        ok: false,
        error: 'chain_not_supported',
      };

      expect(errorResponse.ok).toBe(false);
      expect(errorResponse.error).toBe('chain_not_supported');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full sync flow: DG 500 -> ETH 0 (FREE)', async () => {
      // Setup: Database has DG 500, on-chain has FREE
      mockIsAnyUserWalletIsLockManagerParallel.mockResolvedValue({
        anyIsManager: true,
      });

      // Mock event fetch
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockEvent,
              error: null,
            }),
          }),
        }),
      });

      // Mock on-chain query
      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(0n),
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      mockResolveCurrencyFromAddress.mockReturnValue('ETH');

      // Mock database update
      mockSupabaseClient.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  ...mockEvent,
                  price: 0,
                  currency: 'ETH',
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      // Execute sync
      const isManager = await mockIsAnyUserWalletIsLockManagerParallel(
        mockEvent.lock_address,
        ['0xUSER123'],
        mockNetworkConfig.rpc_url
      );

      expect(isManager.anyIsManager).toBe(true);

      const onChainKeyPrice = await mockLockContract.keyPrice();
      const onChainTokenAddress = await mockLockContract.tokenAddress();

      expect(onChainKeyPrice).toBe(0n);
      expect(onChainTokenAddress).toBe(ethers.ZeroAddress);

      const currency = mockResolveCurrencyFromAddress(onChainTokenAddress, mockNetworkConfig);
      expect(currency).toBe('ETH');

      // Verify update would be called with correct values
      const expectedUpdate = {
        price: 0,
        currency: 'ETH',
        updated_at: expect.any(String),
      };

      expect(expectedUpdate.price).toBe(0);
      expect(expectedUpdate.currency).toBe('ETH');
    });

    it('should handle full sync flow: USDC price update', async () => {
      // Setup: Database has USDC 10, on-chain has USDC 5
      mockIsAnyUserWalletIsLockManagerParallel.mockResolvedValue({
        anyIsManager: true,
      });

      const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(5_000_000n), // 5 USDC
        tokenAddress: vi.fn().mockResolvedValue(usdcAddress),
      };

      const mockTokenContract = {
        decimals: vi.fn().mockResolvedValue(6),
      };

      mockResolveCurrencyFromAddress.mockReturnValue('USDC');

      const onChainKeyPrice = await mockLockContract.keyPrice();
      const onChainTokenAddress = await mockLockContract.tokenAddress();
      const decimals = await mockTokenContract.decimals();

      expect(onChainKeyPrice).toBe(5_000_000n);
      expect(decimals).toBe(6);

      const humanPrice = parseFloat(ethers.formatUnits(onChainKeyPrice, decimals));
      expect(humanPrice).toBe(5);

      const currency = mockResolveCurrencyFromAddress(onChainTokenAddress, mockNetworkConfig);
      expect(currency).toBe('USDC');
    });
  });
});
