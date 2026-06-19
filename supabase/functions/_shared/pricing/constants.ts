import type { CryptoSymbol, FiatSymbol, SupportedSymbol } from "./types.ts";

export const SUPPORTED_CRYPTO_SYMBOLS: CryptoSymbol[] = [
  "DG",
  "UP",
  "ETH",
  "USDC",
  "G",
];

export const APPROVED_FIAT_SYMBOLS_ENGINE: FiatSymbol[] = [
  "USD",
  "NGN",
  "RWF",
  "KES",
  "GHS",
  "ZAR",
  "UGX",
  "SGD",
  "EUR",
  "GBP",
];

export const SUPPORTED_SYMBOLS: SupportedSymbol[] = [
  ...SUPPORTED_CRYPTO_SYMBOLS,
  ...APPROVED_FIAT_SYMBOLS_ENGINE,
];

export const FIAT_RATE_CACHE_SECONDS = 300;
