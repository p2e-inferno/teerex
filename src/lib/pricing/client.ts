import { callEdgeFunction } from '@/lib/edgeFunctions';
import type {
  PriceConversionQuote,
  PriceConversionRequest,
  PriceConversionResponse,
} from './types';

export async function getPriceConversion(
  request: PriceConversionRequest,
): Promise<PriceConversionQuote> {
  const body: Record<string, unknown> = {
    amount: request.amount,
    from: request.from,
    to: request.to,
  };

  if (request.chainId !== undefined) {
    body.chain_id = request.chainId;
  }

  const data = await callEdgeFunction<PriceConversionResponse>(
    'get-price-conversion',
    body,
    {},
  );

  return data.quote;
}
