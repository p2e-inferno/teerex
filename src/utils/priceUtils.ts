/**
 * Price validation and utility functions for crypto payments
 * Supports dynamic networks with different native currencies
 */

import { CryptoCurrency, usesWholeNumberPricing, isNativeToken } from '@/types/currency';

export interface PriceValidationResult {
  isValid: boolean;
  error: string;
}

/**
 * Minimum price thresholds based on token pricing rules
 */
// ERC20 tokens with whole-number pricing (USDC, DG, G, UP)
export const MIN_WHOLE_NUMBER_PRICE = 1;        // Default $1 minimum (fallback)
// Native tokens with fractional pricing (ETH, etc.)
export const MIN_NATIVE_TOKEN_PRICE = 0.0001;   // 0.0001 minimum
// Fiat currency minimums (NGN via Paystack)
export const MIN_NGN_PRICE = 500;               // ₦500 minimum for Paystack

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
  if (usesWholeNumberPricing(currency)) {
    return getWholeNumberTokenMinimum(currency as CryptoCurrency);
  }
  return MIN_NATIVE_TOKEN_PRICE;
}

/**
 * Get formatted minimum price string for display
 * @param currency - The currency symbol
 * @param nativeCurrencySymbol - The native currency symbol (e.g., 'ETH', 'POL', 'CELO')
 * @returns Formatted string like "$1" or "0.0001 ETH"
 */
export function getMinimumPriceString(currency: string, nativeCurrencySymbol?: string): string {
  if (usesWholeNumberPricing(currency)) {
    const min = getWholeNumberTokenMinimum(currency as CryptoCurrency);
    return `$${min}`;
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
  if (usesWholeNumberPricing(currency)) {
    const min = getWholeNumberTokenMinimum(currency as CryptoCurrency);
    if (price < min) {
      return {
        isValid: false,
        error: `Minimum price is $${min} for ${currency}`,
      };
    }
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
  return usesWholeNumberPricing(currency)
    ? `${getWholeNumberTokenMinimum(currency as CryptoCurrency).toFixed(2)}`
    : '0.0001';
}

const WHOLE_NUMBER_TOKEN_MINIMUMS: Partial<Record<CryptoCurrency, number>> = {
  USDC: 1,
  DG: 100,
  G: 1000,
  UP: 10,
};

export function getWholeNumberTokenMinimum(currency: CryptoCurrency): number {
  return WHOLE_NUMBER_TOKEN_MINIMUMS[currency] ?? MIN_WHOLE_NUMBER_PRICE;
}

/**
 * Validate fiat price (NGN)
 * @param price - The price to validate in NGN
 * @returns Validation result with error message if invalid
 */
export function validateFiatPrice(price: number): PriceValidationResult {
  if (!price || price <= 0) {
    return {
      isValid: false,
      error: 'Please enter a valid price',
    };
  }

  if (price < MIN_NGN_PRICE) {
    return {
      isValid: false,
      error: `Minimum price is ₦${MIN_NGN_PRICE.toLocaleString()}`,
    };
  }

  return {
    isValid: true,
    error: '',
  };
}

/**
 * Check if fiat price is valid (boolean helper)
 * @param price - The price to validate in NGN
 * @returns True if price is valid, false otherwise
 */
export function isFiatPriceValid(price: number): boolean {
  return validateFiatPrice(price).isValid;
}
