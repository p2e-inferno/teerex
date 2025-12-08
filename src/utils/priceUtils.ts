/**
 * Price validation and utility functions for crypto payments
 * Supports dynamic networks with different native currencies
 */

export interface PriceValidationResult {
  isValid: boolean;
  error: string;
}

/**
 * Minimum price thresholds
 */
export const MIN_USDC_PRICE = 1;
export const MIN_NATIVE_PRICE = 0.0001;

/**
 * Get minimum price for a given currency
 * @param currency - The currency symbol ('USDC' or native currency)
 * @returns Minimum price as a number
 */
export function getMinimumPrice(currency: string): number {
  return currency === 'USDC' ? MIN_USDC_PRICE : MIN_NATIVE_PRICE;
}

/**
 * Get formatted minimum price string for display
 * @param currency - The currency symbol
 * @param nativeCurrencySymbol - The native currency symbol (e.g., 'ETH', 'POL', 'CELO')
 * @returns Formatted string like "$1" or "0.0001 ETH"
 */
export function getMinimumPriceString(currency: string, nativeCurrencySymbol?: string): string {
  if (currency === 'USDC') {
    return `$${MIN_USDC_PRICE}`;
  }
  const symbol = nativeCurrencySymbol || 'native currency';
  return `${MIN_NATIVE_PRICE} ${symbol}`;
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

  // Check USDC minimum
  if (currency === 'USDC' && price < MIN_USDC_PRICE) {
    return {
      isValid: false,
      error: `Minimum price is $${MIN_USDC_PRICE} USDC`,
    };
  }

  // Check native currency minimum
  if (currency !== 'USDC' && price < MIN_NATIVE_PRICE) {
    const symbol = nativeCurrencySymbol || 'native currency';
    return {
      isValid: false,
      error: `Minimum price is ${MIN_NATIVE_PRICE} ${symbol}`,
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
 * Get step value for price input based on currency
 * @param currency - The currency symbol
 * @returns Step value for HTML input
 */
export function getPriceStep(currency: string): string {
  return currency === 'USDC' ? '1' : '0.0001';
}

/**
 * Get placeholder value for price input based on currency
 * @param currency - The currency symbol
 * @returns Placeholder string for HTML input
 */
export function getPricePlaceholder(currency: string): string {
  return currency === 'USDC' ? '1.00' : '0.0001';
}
