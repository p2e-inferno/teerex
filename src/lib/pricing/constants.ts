import type { FiatSymbol, CryptoSymbol, SupportedSymbol } from './types';

export const SUPPORTED_CRYPTO_SYMBOLS: CryptoSymbol[] = [
  'DG',
  'UP',
  'ETH',
  'USDC',
  'G',
];

export const SUPPORTED_FIAT_SYMBOLS: FiatSymbol[] = [
  'USD',
  'NGN',
  'RWF',
  'KES',
  'GHS',
  'ZAR',
  'UGX',
  'SGD',
  'EUR',
  'GBP',
];

export const SUPPORTED_PRICE_SYMBOLS: SupportedSymbol[] = [
  ...SUPPORTED_CRYPTO_SYMBOLS,
  ...SUPPORTED_FIAT_SYMBOLS,
];

export function isSupportedPriceSymbol(value: string): value is SupportedSymbol {
  return SUPPORTED_PRICE_SYMBOLS.includes(value.toUpperCase() as SupportedSymbol);
}
