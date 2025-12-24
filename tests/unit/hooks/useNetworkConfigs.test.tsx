import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { mockNetworkConfigs } from '@/test/mocks/networkConfigs';
import type { ReactNode } from 'react';

// Mock the network-config module
vi.mock('@/lib/config/network-config', () => ({
  fetchNetworkConfigs: vi.fn(),
  fetchNetworkConfigByChainId: vi.fn(),
  networkQueryKeys: {
    all: ['networkConfigs'],
    byChainId: (chainId: number) => ['networkConfigs', chainId],
  },
  clearNetworkMemoryCache: vi.fn(),
}));

describe('useNetworkConfigs', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  describe('hasToken', () => {
    it('should return true for DG on Base (8453)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(8453, 'DG')).toBe(true);
    });

    it('should return false for DG on Celo (42220)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(42220, 'DG')).toBe(false);
    });

    it('should return true for G on Celo (42220)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(42220, 'G')).toBe(true);
    });

    it('should return false for G on Base (8453)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(8453, 'G')).toBe(false);
    });

    it('should return true for UP on Base (8453)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(8453, 'UP')).toBe(true);
    });

    it('should return true for G on Ethereum (1)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(1, 'G')).toBe(true);
    });

    it('should return true for USDC on all networks', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(8453, 'USDC')).toBe(true);
      expect(result.current.hasToken(42220, 'USDC')).toBe(true);
      expect(result.current.hasToken(1, 'USDC')).toBe(true);
      expect(result.current.hasToken(84532, 'USDC')).toBe(true);
    });

    it('should return false for unknown chain', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasToken(99999, 'DG')).toBe(false);
    });
  });

  describe('getTokenAddress', () => {
    it('should return DG address for Base (8453)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getTokenAddress(8453, 'DG')).toBe('0x4aA47eD29959c7053996d8f7918db01A62D02ee5');
    });

    it('should return null for DG on Celo (42220)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getTokenAddress(42220, 'DG')).toBeNull();
    });

    it('should return G address for Celo (42220)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getTokenAddress(42220, 'G')).toBe('0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A');
    });

    it('should return G address for Ethereum (1)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getTokenAddress(1, 'G')).toBe('0x67C5870b4A41D4Ebef24d2456547A03F1f3e094B');
    });

    it('should return UP address for Base (8453)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getTokenAddress(8453, 'UP')).toBe('0xac27fa800955849d6d17cc8952ba9dd6eaa66187');
    });

    it('should return null for unknown chain', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getTokenAddress(99999, 'DG')).toBeNull();
    });
  });

  describe('getAvailableTokens', () => {
    it('should return ETH, USDC, DG, UP for Base (8453)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const tokens = result.current.getAvailableTokens(8453);
      expect(tokens).toEqual(['ETH', 'USDC', 'DG', 'UP']);
    });

    it('should return ETH, USDC, G for Celo (42220)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const tokens = result.current.getAvailableTokens(42220);
      expect(tokens).toEqual(['ETH', 'USDC', 'G']);
    });

    it('should return ETH, USDC, G for Ethereum (1)', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const tokens = result.current.getAvailableTokens(1);
      expect(tokens).toEqual(['ETH', 'USDC', 'G']);
    });

    it('should return ETH, USDC for Base Sepolia (84532) - no DG/UP/G', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const tokens = result.current.getAvailableTokens(84532);
      expect(tokens).toEqual(['ETH', 'USDC']);
    });

    it('should return only ETH for unknown chain', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const tokens = result.current.getAvailableTokens(99999);
      expect(tokens).toEqual(['ETH']);
    });
  });

  describe('loading and error states', () => {
    it('should handle loading state correctly', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.networks).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('should handle error state correctly', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load network configurations');
      expect(result.current.networks).toEqual([]);
    });

    it('should return data when loading completes successfully', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.networks).toEqual(Object.values(mockNetworkConfigs));
      expect(result.current.error).toBeNull();
    });
  });

  describe('other helper functions', () => {
    it('should return correct network by chain ID', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const network = result.current.getNetworkByChainId(8453);
      expect(network?.chain_name).toBe('Base');
      expect(network?.chain_id).toBe(8453);
    });

    it('should return undefined for unknown chain ID', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const network = result.current.getNetworkByChainId(99999);
      expect(network).toBeUndefined();
    });

    it('should return correct USDC address', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getUsdcAddress(8453)).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });

    it('should return correct factory address', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getFactoryAddress(8453)).toBe('0xd0b14797b9D08493392865647384974470202A78');
    });

    it('should return correct RPC URL', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getRpcUrl(8453)).toBe('https://base-rpc.publicnode.com');
    });

    it('should have refreshNetworks function', async () => {
      const { fetchNetworkConfigs } = await import('@/lib/config/network-config');
      vi.mocked(fetchNetworkConfigs).mockResolvedValue(Object.values(mockNetworkConfigs));

      const { result } = renderHook(() => useNetworkConfigs(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refreshNetworks).toBe('function');
    });
  });
});
