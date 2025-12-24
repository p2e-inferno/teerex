import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTokenAddressAsync, ZERO_ADDRESS, clearNetworkMemoryCache } from '@/lib/config/network-config';
import { mockNetworkConfigs } from '@/test/mocks/networkConfigs';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({
              data: null,
              error: null,
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('network-config.ts - Token Address Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getTokenAddressAsync', () => {
    it('should return ZERO_ADDRESS for ETH on any chain', async () => {
      const address = await getTokenAddressAsync(8453, 'ETH');
      expect(address).toBe(ZERO_ADDRESS);
    });

    it('should return DG address for Base Mainnet (8453)', async () => {
      // Mock the supabase response for Base
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.base,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(8453, 'DG');
      expect(address).toBe('0x4aA47eD29959c7053996d8f7918db01A62D02ee5');
    });

    it('should return null for DG on Celo (not available)', async () => {
      // Mock the supabase response for Celo
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.celo,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(42220, 'DG');
      expect(address).toBeNull();
    });

    it('should return G address for Celo (42220)', async () => {
      // Mock the supabase response for Celo
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.celo,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(42220, 'G');
      expect(address).toBe('0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A');
    });

    it('should return G address for Ethereum (1)', async () => {
      // Mock the supabase response for Ethereum
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.ethereum,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(1, 'G');
      expect(address).toBe('0x67C5870b4A41D4Ebef24d2456547A03F1f3e094B');
    });

    it('should return null for G on Base (not available)', async () => {
      // Mock the supabase response for Base
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.base,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(8453, 'G');
      expect(address).toBeNull();
    });

    it('should return UP address for Base Mainnet (8453)', async () => {
      // Mock the supabase response for Base
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.base,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(8453, 'UP');
      expect(address).toBe('0xac27fa800955849d6d17cc8952ba9dd6eaa66187');
    });

    it('should return null for UP on Celo (not available)', async () => {
      // Mock the supabase response for Celo
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.celo,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(42220, 'UP');
      expect(address).toBeNull();
    });

    it('should return USDC address for Base Mainnet', async () => {
      // Mock the supabase response for Base
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockNetworkConfigs.base,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(8453, 'USDC');
      expect(address).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });

    it('should return null when network config is not found', async () => {
      // Mock the supabase response with null data
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(99999, 'DG');
      expect(address).toBeNull();
    });

    it('should return null and log error when database query fails', async () => {
      // Clear cache to ensure we hit the database
      clearNetworkMemoryCache();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock the supabase response with an error
      const { supabase } = await import('@/integrations/supabase/client');
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
              }),
            }),
          }),
        }),
      } as any);

      const address = await getTokenAddressAsync(99999, 'DG');

      expect(address).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching DG address'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });
});
