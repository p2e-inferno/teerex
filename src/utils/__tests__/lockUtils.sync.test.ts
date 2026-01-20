/**
 * Tests for on-chain pricing sync utilities
 *
 * Tests getOnChainLockPricing() and resolveCurrencyFromTokenAddress()
 * functions that query lock contracts and resolve token addresses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import {
  getOnChainLockPricing,
  resolveCurrencyFromTokenAddress,
} from '../lockUtils';
import * as networkConfig from '@/lib/config/network-config';

// Mock ethers contract calls
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  return {
    ...actual,
    Contract: vi.fn(),
    JsonRpcProvider: vi.fn(),
  };
});

vi.mock('@/lib/config/network-config');

describe('getOnChainLockPricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Native Token (ETH) Locks', () => {
    it('should correctly query ETH lock pricing', async () => {
      // Mock network config
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        chain_name: 'Base Mainnet',
        rpc_url: 'https://mainnet.base.org',
        native_currency_symbol: 'ETH',
        usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        dg_token_address: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
        g_token_address: null,
        up_token_address: null,
      } as any);

      // Mock contract calls
      const mockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseEther('0.01')), // 0.01 ETH
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockContract as any);
      vi.mocked(ethers.JsonRpcProvider).mockImplementation(() => ({}) as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result).toEqual({
        price: 0.01,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });

      expect(mockContract.keyPrice).toHaveBeenCalledTimes(1);
      expect(mockContract.tokenAddress).toHaveBeenCalledTimes(1);
    });

    it('should correctly query FREE lock (0 price ETH)', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
      } as any);

      const mockContract = {
        keyPrice: vi.fn().mockResolvedValue(0n), // FREE
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result).toEqual({
        price: 0,
        currency: 'ETH',
        tokenAddress: ethers.ZeroAddress,
      });
    });

    it('should handle large ETH amounts', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
      } as any);

      const mockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseEther('100')), // 100 ETH
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result.price).toBe(100);
      expect(result.currency).toBe('ETH');
    });

    it('should handle very small ETH amounts', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
      } as any);

      const mockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseEther('0.0001')), // Min price
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result.price).toBe(0.0001);
      expect(result.currency).toBe('ETH');
    });
  });

  describe('ERC20 Token Locks', () => {
    it('should correctly query USDC lock pricing (6 decimals)', async () => {
      const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
        usdc_token_address: usdcAddress,
        dg_token_address: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
      } as any);

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(10_000_000n), // 10 USDC (6 decimals)
        tokenAddress: vi.fn().mockResolvedValue(usdcAddress),
      };

      const mockTokenContract = {
        decimals: vi.fn().mockResolvedValue(6),
      };

      vi.mocked(ethers.Contract)
        .mockImplementationOnce(() => mockLockContract as any) // Lock contract
        .mockImplementationOnce(() => mockTokenContract as any); // Token contract

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result).toEqual({
        price: 10,
        currency: 'USDC',
        tokenAddress: usdcAddress,
      });

      expect(mockTokenContract.decimals).toHaveBeenCalledTimes(1);
    });

    it('should correctly query DG lock pricing (18 decimals)', async () => {
      const dgAddress = '0x4aA47eD29959c7053996d8f7918db01A62D02ee5';

      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
        usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        dg_token_address: dgAddress,
      } as any);

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseUnits('500', 18)), // 500 DG
        tokenAddress: vi.fn().mockResolvedValue(dgAddress),
      };

      const mockTokenContract = {
        decimals: vi.fn().mockResolvedValue(18),
      };

      vi.mocked(ethers.Contract)
        .mockImplementationOnce(() => mockLockContract as any)
        .mockImplementationOnce(() => mockTokenContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result).toEqual({
        price: 500,
        currency: 'DG',
        tokenAddress: dgAddress,
      });
    });

    it('should handle fractional ERC20 amounts', async () => {
      const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
        usdc_token_address: usdcAddress,
      } as any);

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(10_500_000n), // 10.5 USDC
        tokenAddress: vi.fn().mockResolvedValue(usdcAddress),
      };

      const mockTokenContract = {
        decimals: vi.fn().mockResolvedValue(6),
      };

      vi.mocked(ethers.Contract)
        .mockImplementationOnce(() => mockLockContract as any)
        .mockImplementationOnce(() => mockTokenContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result.price).toBe(10.5);
      expect(result.currency).toBe('USDC');
    });

    it('should handle unknown token addresses', async () => {
      const unknownAddress = '0xUNKNOWNTOKEN123';

      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
        usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      } as any);

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseUnits('100', 18)),
        tokenAddress: vi.fn().mockResolvedValue(unknownAddress),
      };

      const mockTokenContract = {
        decimals: vi.fn().mockResolvedValue(18),
      };

      vi.mocked(ethers.Contract)
        .mockImplementationOnce(() => mockLockContract as any)
        .mockImplementationOnce(() => mockTokenContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result).toEqual({
        price: 100,
        currency: 'UNKNOWN',
        tokenAddress: unknownAddress,
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw on invalid lock address', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
      } as any);

      const mockContract = {
        keyPrice: vi.fn().mockRejectedValue(new Error('Invalid address')),
        tokenAddress: vi.fn().mockRejectedValue(new Error('Invalid address')),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockContract as any);

      await expect(getOnChainLockPricing('0xINVALID', 8453)).rejects.toThrow();
    });

    it('should throw on unsupported chain', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(null);

      await expect(getOnChainLockPricing('0xLOCK123', 999999)).rejects.toThrow(
        'Network 999999 not configured'
      );
    });

    it('should throw on missing RPC URL', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: null,
      } as any);

      await expect(getOnChainLockPricing('0xLOCK123', 8453)).rejects.toThrow(
        'No RPC URL configured'
      );
    });

    it('should throw on contract call failure', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
      } as any);

      const mockContract = {
        keyPrice: vi.fn().mockRejectedValue(new Error('RPC request failed')),
        tokenAddress: vi.fn().mockRejectedValue(new Error('RPC request failed')),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockContract as any);

      await expect(getOnChainLockPricing('0xLOCK123', 8453)).rejects.toThrow(
        'RPC request failed'
      );
    });

    it('should throw on token decimals() call failure', async () => {
      const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
        usdc_token_address: usdcAddress,
      } as any);

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(10_000_000n),
        tokenAddress: vi.fn().mockResolvedValue(usdcAddress),
      };

      const mockTokenContract = {
        decimals: vi.fn().mockRejectedValue(new Error('Token contract error')),
      };

      vi.mocked(ethers.Contract)
        .mockImplementationOnce(() => mockLockContract as any)
        .mockImplementationOnce(() => mockTokenContract as any);

      await expect(getOnChainLockPricing('0xLOCK123', 8453)).rejects.toThrow(
        'Token contract error'
      );
    });
  });

  describe('Multi-Chain Support', () => {
    it('should work on Base Mainnet (8453)', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 8453,
        rpc_url: 'https://mainnet.base.org',
        usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      } as any);

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseEther('0.01')),
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockLockContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 8453);

      expect(result.price).toBe(0.01);
    });

    it('should work on Base Sepolia (84532)', async () => {
      vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
        chain_id: 84532,
        rpc_url: 'https://sepolia.base.org',
        usdc_token_address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      } as any);

      const mockLockContract = {
        keyPrice: vi.fn().mockResolvedValue(ethers.parseEther('0.001')),
        tokenAddress: vi.fn().mockResolvedValue(ethers.ZeroAddress),
      };

      vi.mocked(ethers.Contract).mockImplementation(() => mockLockContract as any);

      const result = await getOnChainLockPricing('0xLOCK123', 84532);

      expect(result.price).toBe(0.001);
    });
  });
});

describe('resolveCurrencyFromTokenAddress', () => {
  const mockNetworkConfig = {
    chain_id: 8453,
    usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    dg_token_address: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
    g_token_address: '0xGTOKENADDRESS',
    up_token_address: '0xUPTOKENADDRESS',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve ETH from zero address', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(mockNetworkConfig);

    const result = await resolveCurrencyFromTokenAddress(ethers.ZeroAddress, 8453);

    expect(result).toBe('ETH');
  });

  it('should resolve USDC token address', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(mockNetworkConfig);

    const result = await resolveCurrencyFromTokenAddress(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      8453
    );

    expect(result).toBe('USDC');
  });

  it('should resolve DG token address', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(mockNetworkConfig);

    const result = await resolveCurrencyFromTokenAddress(
      '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
      8453
    );

    expect(result).toBe('DG');
  });

  it('should resolve G token address', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(mockNetworkConfig);

    const result = await resolveCurrencyFromTokenAddress('0xGTOKENADDRESS', 8453);

    expect(result).toBe('G');
  });

  it('should resolve UP token address', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(mockNetworkConfig);

    const result = await resolveCurrencyFromTokenAddress('0xUPTOKENADDRESS', 8453);

    expect(result).toBe('UP');
  });

  it('should be case-insensitive', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(mockNetworkConfig);

    const result1 = await resolveCurrencyFromTokenAddress(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toUpperCase(),
      8453
    );
    const result2 = await resolveCurrencyFromTokenAddress(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase(),
      8453
    );

    expect(result1).toBe('USDC');
    expect(result2).toBe('USDC');
  });

  it('should return UNKNOWN for unrecognized addresses', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(mockNetworkConfig);

    const result = await resolveCurrencyFromTokenAddress('0xUNKNOWNTOKEN', 8453);

    expect(result).toBe('UNKNOWN');
  });

  it('should throw on network config fetch failure', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue(null);

    await expect(
      resolveCurrencyFromTokenAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 999999)
    ).rejects.toThrow('Network 999999 not configured');
  });

  it('should handle missing token addresses in config', async () => {
    vi.mocked(networkConfig.getNetworkConfigByChainId).mockResolvedValue({
      chain_id: 8453,
      usdc_token_address: null,
      dg_token_address: null,
      g_token_address: null,
      up_token_address: null,
    } as any);

    const result = await resolveCurrencyFromTokenAddress(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      8453
    );

    expect(result).toBe('UNKNOWN');
  });
});
