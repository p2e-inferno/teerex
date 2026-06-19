import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { getPriceConversion } from '@/lib/pricing/client';
import type { PriceConversionQuote } from '@/lib/pricing/types';

vi.mock('@/lib/edgeFunctions', () => ({
  callEdgeFunction: vi.fn(),
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

describe('pricing client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the get-price-conversion Edge Function through callEdgeFunction', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({
      ok: true,
      chain_id: 8453,
      quote,
    });

    await expect(getPriceConversion({
      amount: 2,
      from: 'DG',
      to: 'NGN',
      chainId: 8453,
    })).resolves.toBe(quote);

    expect(callEdgeFunction).toHaveBeenCalledWith(
      'get-price-conversion',
      {
        amount: 2,
        from: 'DG',
        to: 'NGN',
        chain_id: 8453,
      },
      {},
    );
  });

  it('omits chain_id when the caller wants the server default', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({
      ok: true,
      chain_id: 8453,
      quote,
    });

    await getPriceConversion({
      amount: 2,
      from: 'DG',
      to: 'NGN',
    });

    expect(callEdgeFunction).toHaveBeenCalledWith(
      'get-price-conversion',
      {
        amount: 2,
        from: 'DG',
        to: 'NGN',
      },
      {},
    );
  });
});
