import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePriceConversion } from '@/hooks/usePriceConversion';
import { getPriceConversion } from '@/lib/pricing/client';
import type { PriceConversionQuote } from '@/lib/pricing/types';

vi.mock('@/lib/pricing/client', () => ({
  getPriceConversion: vi.fn(),
}));

const quote: PriceConversionQuote = {
  inputAmount: 2,
  outputAmount: 3000,
  from: 'DG',
  to: 'NGN',
  spotRate: 1500,
  path: ['DG', 'UP', 'USDC', 'USD', 'NGN'],
  stale: false,
  errors: [],
  asOf: 1_717_171_717_000,
};

describe('usePriceConversion', () => {
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

  it('fetches and returns a price conversion quote', async () => {
    vi.mocked(getPriceConversion).mockResolvedValue(quote);

    const request = {
      amount: 2,
      from: 'DG' as const,
      to: 'NGN' as const,
      chainId: 8453,
    };
    const { result } = renderHook(() => usePriceConversion(request), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe(quote);
    expect(getPriceConversion).toHaveBeenCalledWith(request);
  });

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(
      () => usePriceConversion(
        {
          amount: 2,
          from: 'DG',
          to: 'NGN',
          chainId: 8453,
        },
        { enabled: false },
      ),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(getPriceConversion).not.toHaveBeenCalled();
  });
});
