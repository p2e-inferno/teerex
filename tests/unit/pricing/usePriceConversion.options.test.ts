import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn((options) => options),
  getPriceConversion: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}));

vi.mock('@/lib/pricing/client', () => ({
  getPriceConversion: mocks.getPriceConversion,
}));

import { usePriceConversion } from '@/hooks/usePriceConversion';

describe('usePriceConversion options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not poll by default', () => {
    usePriceConversion({
      amount: 2,
      from: 'DG',
      to: 'NGN',
      chainId: 8453,
    });

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchInterval: false,
      }),
    );
  });

  it('allows callers to opt into polling', () => {
    usePriceConversion(
      {
        amount: 2,
        from: 'DG',
        to: 'NGN',
        chainId: 8453,
      },
      { refetchInterval: 60_000 },
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchInterval: 60_000,
      }),
    );
  });
});
