import { describe, expect, it, vi } from 'vitest';
import {
  fetchFiatEdges,
  normalizeFiatRatesToEdges,
  parseCoinbaseFiatRateResponse,
  parseOpenErApiRateResponse,
} from '../../../supabase/functions/_shared/pricing/sources/fiat.ts';
import { normalizeUniswapQuotesToEdges } from '../../../supabase/functions/_shared/pricing/sources/uniswap.ts';
import { normalizeVendorRateToEdges } from '../../../supabase/functions/_shared/pricing/sources/vendor.ts';

const asOf = 1_717_171_717_000;

describe('pricing sources', () => {
  it('normalizes the DG vendor rate in both directions', () => {
    expect(normalizeVendorRateToEdges(25n, asOf)).toEqual([
      { from: 'UP', to: 'DG', rate: 25, source: 'vendor', asOf },
      { from: 'DG', to: 'UP', rate: 0.04, source: 'vendor', asOf },
    ]);
  });

  it('normalizes Uniswap quotes with token decimals', () => {
    const edges = normalizeUniswapQuotesToEdges(
      {
        ethIn: 10n ** 18n,
        ethToUsdcOut: 2500n * 10n ** 6n,
        upIn: 10n ** 18n,
        upToUsdcOut: 4n * 10n ** 6n,
      },
      asOf,
    );

    expect(edges).toContainEqual({
      from: 'ETH',
      to: 'USDC',
      rate: 2500,
      source: 'uniswap',
      asOf,
    });
    expect(edges).toContainEqual({
      from: 'UP',
      to: 'USDC',
      rate: 4,
      source: 'uniswap',
      asOf,
    });
  });

  it('parses approved Coinbase fiat rates only', () => {
    const parsed = parseCoinbaseFiatRateResponse(
      {
        data: {
          currency: 'USD',
          rates: {
            NGN: '1500',
            EUR: '0.92',
            CAD: '1.37',
            RWF: 'not-a-number',
          },
        },
      },
      asOf,
    );

    expect(parsed).toEqual({
      base: 'USD',
      asOf,
      rates: {
        USD: 1,
        NGN: 1500,
        EUR: 0.92,
      },
    });
  });

  it('parses Open ER fallback rates and converts them to directed edges', () => {
    const parsed = parseOpenErApiRateResponse({
      result: 'success',
      time_last_update_unix: 1_717_171_717,
      base_code: 'USD',
      rates: {
        NGN: 1500,
        GHS: 15,
        CAD: 1.37,
      },
    });

    expect(normalizeFiatRatesToEdges(parsed)).toEqual([
      { from: 'USD', to: 'NGN', rate: 1500, source: 'fiat_api', asOf },
      { from: 'NGN', to: 'USD', rate: 1 / 1500, source: 'fiat_api', asOf },
      { from: 'USD', to: 'GHS', rate: 15, source: 'fiat_api', asOf },
      { from: 'GHS', to: 'USD', rate: 1 / 15, source: 'fiat_api', asOf },
    ]);
  });

  it('falls back from Coinbase to Open ER when the primary source fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('upstream failed', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: 'success',
        time_last_update_unix: 1_717_171_717,
        base_code: 'USD',
        rates: { NGN: 1500 },
      })));

    const edges = await fetchFiatEdges({ fetchFn: fetchFn as typeof fetch });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(edges).toEqual([
      { from: 'USD', to: 'NGN', rate: 1500, source: 'fiat_api', asOf },
      { from: 'NGN', to: 'USD', rate: 1 / 1500, source: 'fiat_api', asOf },
    ]);
    warnSpy.mockRestore();
  });
});
