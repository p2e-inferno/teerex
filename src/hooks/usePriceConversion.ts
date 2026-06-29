import { useQuery } from '@tanstack/react-query';
import { getPriceConversion } from '@/lib/pricing/client';
import type { PriceConversionRequest } from '@/lib/pricing/types';

export const priceConversionQueryKeys = {
  quote: (request: PriceConversionRequest) => [
    'price-conversion',
    request.chainId ?? null,
    request.from,
    request.to,
    request.amount,
  ] as const,
};

export function usePriceConversion(
  request: PriceConversionRequest,
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  return useQuery({
    queryKey: priceConversionQueryKeys.quote(request),
    queryFn: () => getPriceConversion(request),
    enabled:
      (options?.enabled ?? true) &&
      Number.isFinite(request.amount) &&
      request.amount >= 0,
    staleTime: 30 * 1000,
    refetchInterval: options?.refetchInterval ?? false,
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

export type { PriceConversionQuote, PriceConversionRequest } from '@/lib/pricing/types';
