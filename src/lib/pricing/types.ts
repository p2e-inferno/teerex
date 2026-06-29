export type CryptoSymbol = 'DG' | 'UP' | 'ETH' | 'USDC' | 'G';

export type FiatSymbol =
  | 'USD'
  | 'NGN'
  | 'RWF'
  | 'KES'
  | 'GHS'
  | 'ZAR'
  | 'UGX'
  | 'SGD'
  | 'EUR'
  | 'GBP';

export type SupportedSymbol = CryptoSymbol | FiatSymbol;

export interface PriceConversionQuote {
  inputAmount: number;
  outputAmount: number;
  from: SupportedSymbol;
  to: SupportedSymbol;
  spotRate: number | null;
  path: SupportedSymbol[];
  stale: boolean;
  errors: string[];
  asOf: number | null;
}

export interface PriceConversionRequest {
  amount: number;
  from: SupportedSymbol;
  to: SupportedSymbol;
  chainId?: number;
}

export interface PriceConversionResponse {
  ok: true;
  chain_id: number;
  quote: PriceConversionQuote;
}
