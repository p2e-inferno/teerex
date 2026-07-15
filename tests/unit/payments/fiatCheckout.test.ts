import { describe, expect, it } from 'vitest';
import { getFiatCheckoutConfig } from '@/lib/payments/fiatCheckout';

describe('fiat checkout configuration', () => {
  it('is available only when fiat is enabled and Paystack is configured', () => {
    expect(getFiatCheckoutConfig({
      VITE_ENABLE_FIAT: 'true',
      VITE_PAYSTACK_PUBLIC_KEY: ' pk_test_123 ',
    })).toEqual({
      enabled: true,
      publicKey: 'pk_test_123',
      configured: true,
      available: true,
    });

    expect(getFiatCheckoutConfig({
      VITE_ENABLE_FIAT: 'false',
      VITE_PAYSTACK_PUBLIC_KEY: 'pk_test_123',
    }).available).toBe(false);

    expect(getFiatCheckoutConfig({
      VITE_ENABLE_FIAT: 'true',
      VITE_PAYSTACK_PUBLIC_KEY: '   ',
    }).available).toBe(false);
  });
});
