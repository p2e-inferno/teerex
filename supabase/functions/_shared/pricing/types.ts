export type CryptoSymbol = "DG" | "UP" | "ETH" | "USDC" | "G";

export type FiatSymbol =
  | "USD"
  | "NGN"
  | "RWF"
  | "KES"
  | "GHS"
  | "ZAR"
  | "UGX"
  | "SGD"
  | "EUR"
  | "GBP";

export type SupportedSymbol = CryptoSymbol | FiatSymbol;

export type RateSource = "vendor" | "uniswap" | "fiat_api";

export interface RateEdge {
  from: SupportedSymbol;
  to: SupportedSymbol;
  rate: number;
  source: RateSource;
  asOf: number;
}

export interface ConversionResult {
  inputAmount: number;
  outputAmount: number;
  path: SupportedSymbol[];
  stale: boolean;
  errors: string[];
}

export interface PricingSnapshot {
  edges: RateEdge[];
  errors: string[];
  asOf: number;
}

export interface PriceConversionQuote extends ConversionResult {
  from: SupportedSymbol;
  to: SupportedSymbol;
  spotRate: number | null;
  asOf: number | null;
}

export interface FiatRateResponse {
  base: "USD";
  asOf: number;
  rates: Partial<Record<FiatSymbol, number>>;
}
