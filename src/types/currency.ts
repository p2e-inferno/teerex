/**
 * Single source of truth for all currency/token types in TeeRex
 *
 * This file defines supported payment currencies across the platform.
 * When adding a new token:
 * 1. Add to CryptoCurrency type
 * 2. Add to WHOLE_NUMBER_TOKENS or NATIVE_TOKENS category based on pricing rules
 * 3. Ensure network_configs table has token address column
 *
 * Note: "FREE" is NOT a currency - it's a payment method.
 * Free events have paymentMethod='free' with price=0 and currency set to a default (ETH).
 *
 * Token metadata (name, symbol, decimals) should be fetched dynamically from contracts.
 */

// All supported crypto currencies for event pricing
export type CryptoCurrency = 'ETH' | 'USDC' | 'DG' | 'G' | 'UP';

// Token categories based on pricing validation rules
// ERC20 tokens with whole-number pricing (minimum $1, step=1)
export const WHOLE_NUMBER_TOKENS: readonly CryptoCurrency[] = ['USDC', 'DG', 'G', 'UP'] as const;

// Native blockchain tokens with fractional pricing (minimum 0.0001, step=0.0001)
export const NATIVE_TOKENS: readonly CryptoCurrency[] = ['ETH'] as const;

/**
 * Type guard: Check if token uses whole-number pricing ($1 minimum, step=1)
 * Applies to ERC20 tokens like USDC, DG, G, UP (regardless of whether they're stablecoins)
 */
export function usesWholeNumberPricing(currency: string): currency is 'USDC' | 'DG' | 'G' | 'UP' {
  return WHOLE_NUMBER_TOKENS.includes(currency as CryptoCurrency);
}

/**
 * Type guard: Check if currency is a native blockchain token (0.0001 minimum, step=0.0001)
 * Applies to native currencies like ETH
 */
export function isNativeToken(currency: string): currency is 'ETH' {
  return NATIVE_TOKENS.includes(currency as CryptoCurrency);
}

/**
 * @deprecated Use usesWholeNumberPricing() instead - more accurate naming
 * Legacy alias for backwards compatibility
 */
export function isStablecoin(currency: string): currency is 'USDC' | 'DG' | 'G' | 'UP' {
  return usesWholeNumberPricing(currency);
}
