/**
 * Price validation and utility functions for crypto payments
 * Supports dynamic networks with different native currencies
 */

import { usesWholeNumberPricing, isNativeToken } from '@/types/currency';

export interface PriceValidationResult {
  isValid: boolean;
  error: string;
}

/**
 * Minimum price thresholds based on token pricing rules
 */
// ERC20 tokens with whole-number pricing (USDC, DG, G, UP)
export const MIN_WHOLE_NUMBER_PRICE = 1;        // $1 minimum
// Native tokens with fractional pricing (ETH, etc.)
export const MIN_NATIVE_TOKEN_PRICE = 0.0001;   // 0.0001 minimum

/**
 * @deprecated Use MIN_WHOLE_NUMBER_PRICE instead
 */
export const MIN_STABLECOIN_PRICE = MIN_WHOLE_NUMBER_PRICE;

/**
 * Get minimum price for a given currency based on pricing rules
 * @param currency - The currency symbol
 * @returns Minimum price as a number
 */
export function getMinimumPrice(currency: string): number {
  return usesWholeNumberPricing(currency) ? MIN_WHOLE_NUMBER_PRICE : MIN_NATIVE_TOKEN_PRICE;
}

/**
 * Get formatted minimum price string for display
 * @param currency - The currency symbol
 * @param nativeCurrencySymbol - The native currency symbol (e.g., 'ETH', 'POL', 'CELO')
 * @returns Formatted string like "$1" or "0.0001 ETH"
 */
export function getMinimumPriceString(currency: string, nativeCurrencySymbol?: string): string {
  if (usesWholeNumberPricing(currency)) {
    return `$${MIN_WHOLE_NUMBER_PRICE}`;
  }
  const symbol = nativeCurrencySymbol || 'native currency';
  return `${MIN_NATIVE_TOKEN_PRICE} ${symbol}`;
}

/**
 * Validate crypto price based on currency
 * @param price - The price to validate
 * @param currency - The currency symbol
 * @param nativeCurrencySymbol - Optional native currency symbol for better error messages
 * @returns Validation result with error message if invalid
 */
export function validateCryptoPrice(
  price: number,
  currency: string,
  nativeCurrencySymbol?: string
): PriceValidationResult {
  // Check if price is valid
  if (!price || price <= 0) {
    return {
      isValid: false,
      error: 'Please enter a valid price',
    };
  }

  // Check whole-number pricing tokens (ERC20: USDC, DG, G, UP)
  if (usesWholeNumberPricing(currency) && price < MIN_WHOLE_NUMBER_PRICE) {
    return {
      isValid: false,
      error: `Minimum price is $${MIN_WHOLE_NUMBER_PRICE} for ${currency}`,
    };
  }

  // Check native token minimum (ETH, etc.)
  if (isNativeToken(currency) && price < MIN_NATIVE_TOKEN_PRICE) {
    const symbol = nativeCurrencySymbol || 'native currency';
    return {
      isValid: false,
      error: `Minimum price is ${MIN_NATIVE_TOKEN_PRICE} ${symbol}`,
    };
  }

  return {
    isValid: true,
    error: '',
  };
}

/**
 * Check if crypto price is valid (boolean helper)
 * Useful for enabling/disabling buttons
 * @param price - The price to validate
 * @param currency - The currency symbol
 * @returns True if price is valid, false otherwise
 */
export function isCryptoPriceValid(price: number, currency: string): boolean {
  return validateCryptoPrice(price, currency).isValid;
}

/**
 * Get step value for price input based on currency pricing rules
 * @param currency - The currency symbol
 * @returns Step value for HTML input
 */
export function getPriceStep(currency: string): string {
  return usesWholeNumberPricing(currency) ? '1' : '0.0001';
}

/**
 * Get placeholder value for price input based on currency pricing rules
 * @param currency - The currency symbol
 * @returns Placeholder string for HTML input
 */
export function getPricePlaceholder(currency: string): string {
  return usesWholeNumberPricing(currency) ? '1.00' : '0.0001';
}
