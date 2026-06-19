import { describe, expect, it } from 'vitest';
import {
  convertAmount,
  getPriceConversionQuote,
} from '../../../supabase/functions/_shared/pricing/service.ts';
import type { RateEdge } from '../../../supabase/functions/_shared/pricing/types.ts';

const asOf = 1_717_171_717_000;

function edge(
  from: RateEdge['from'],
  to: RateEdge['to'],
  rate: number,
  source: RateEdge['source'],
): RateEdge {
  return { from, to, rate, source, asOf };
}

describe('pricing service', () => {
  it('combines vendor, Uniswap, bridge, and fiat edges into a quote', async () => {
    const quote = await getPriceConversionQuote({
      amount: 4,
      from: 'DG',
      to: 'NGN',
      fetchers: {
        vendor: async () => [
          edge('DG', 'UP', 0.5, 'vendor'),
          edge('UP', 'DG', 2, 'vendor'),
        ],
        uniswap: async () => [
          edge('UP', 'USDC', 3, 'uniswap'),
          edge('USDC', 'UP', 1 / 3, 'uniswap'),
        ],
        fiat: async () => [
          edge('USD', 'NGN', 1000, 'fiat_api'),
          edge('NGN', 'USD', 0.001, 'fiat_api'),
        ],
      },
    });

    expect(quote).toMatchObject({
      inputAmount: 4,
      outputAmount: 6000,
      from: 'DG',
      to: 'NGN',
      spotRate: 1500,
      path: ['DG', 'UP', 'USDC', 'USD', 'NGN'],
      stale: false,
      errors: [],
      asOf,
    });
  });

  it('keeps usable quotes stale when one source fails', async () => {
    const quote = await getPriceConversionQuote({
      amount: 2,
      from: 'UP',
      to: 'NGN',
      fetchers: {
        vendor: async () => {
          throw new Error('vendor unavailable');
        },
        uniswap: async () => [
          edge('UP', 'USDC', 4, 'uniswap'),
          edge('USDC', 'UP', 0.25, 'uniswap'),
        ],
        fiat: async () => [
          edge('USD', 'NGN', 1200, 'fiat_api'),
          edge('NGN', 'USD', 1 / 1200, 'fiat_api'),
        ],
      },
    });

    expect(quote.outputAmount).toBe(9600);
    expect(quote.path).toEqual(['UP', 'USDC', 'USD', 'NGN']);
    expect(quote.stale).toBe(true);
    expect(quote.errors).toContain('DG vendor rate: vendor unavailable');
  });

  it('reports unavailable pairs without throwing', async () => {
    const quote = await getPriceConversionQuote({
      amount: 5,
      from: 'G',
      to: 'NGN',
      fetchers: {
        vendor: async () => [],
        uniswap: async () => [],
        fiat: async () => [
          edge('USD', 'NGN', 1000, 'fiat_api'),
          edge('NGN', 'USD', 0.001, 'fiat_api'),
        ],
      },
    });

    expect(quote).toMatchObject({
      inputAmount: 5,
      outputAmount: 0,
      from: 'G',
      to: 'NGN',
      spotRate: null,
      path: [],
      stale: false,
      errors: ['Pair not available'],
    });
  });

  it('returns zero output for non-positive amounts without loading a graph', async () => {
    const conversion = await convertAmount({
      amount: 0,
      from: 'DG',
      to: 'NGN',
      fetchers: {
        vendor: async () => {
          throw new Error('should not be called');
        },
      },
    });

    expect(conversion).toEqual({
      inputAmount: 0,
      outputAmount: 0,
      path: [],
      stale: false,
      errors: [],
    });
  });
});
