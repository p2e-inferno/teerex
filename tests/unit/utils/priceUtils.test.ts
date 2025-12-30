
import { describe, it, expect, vi } from 'vitest';
import {
    validateCryptoPrice,
    getMinimumPrice,
    getMinimumPriceString,
    getPriceStep,
    getPricePlaceholder,
    isCryptoPriceValid
} from '../../../src/utils/priceUtils';

// Mock dependencies to isolate tests
vi.mock('@/types/currency', () => ({
    usesWholeNumberPricing: (c: string) => ['USDC', 'DG'].includes(c),
    isNativeToken: (c: string) => ['ETH', 'POL'].includes(c)
}));

describe('priceUtils', () => {
    describe('validateCryptoPrice', () => {
        it('validates USDC (Whole number)', () => {
            expect(validateCryptoPrice(1, 'USDC').isValid).toBe(true);
            expect(validateCryptoPrice(0.5, 'USDC').isValid).toBe(false); // < 1
            expect(validateCryptoPrice(0, 'USDC').isValid).toBe(false);
        });

        it('validates ETH (Native token)', () => {
            expect(validateCryptoPrice(0.0001, 'ETH').isValid).toBe(true);
            expect(validateCryptoPrice(0.00005, 'ETH').isValid).toBe(false); // < 0.0001
        });

        it('returns correct error message', () => {
            const res = validateCryptoPrice(0.5, 'USDC');
            expect(res.error).toBe('Minimum price is $1 for USDC');

            const res2 = validateCryptoPrice(0.00005, 'ETH', 'Ether');
            expect(res2.error).toBe('Minimum price is 0.0001 Ether');
        });
    });

    describe('getMinimumPrice', () => {
        it('returns 1 for whole number currencies', () => {
            expect(getMinimumPrice('USDC')).toBe(1);
        });
        it('returns 0.0001 for native currencies', () => {
            expect(getMinimumPrice('ETH')).toBe(0.0001);
        });
    });

    describe('getMinimumPriceString', () => {
        it('formats whole number price', () => {
            expect(getMinimumPriceString('USDC')).toBe('$1');
        });
        it('formats native price with symbol', () => {
            expect(getMinimumPriceString('ETH', 'ETH')).toBe('0.0001 ETH');
        });
        it('formats native price default symbol', () => {
            expect(getMinimumPriceString('ETH')).toBe('0.0001 native currency');
        });
    });

    describe('isCryptoPriceValid', () => {
        it('returns boolean directly', () => {
            expect(isCryptoPriceValid(10, 'USDC')).toBe(true);
            expect(isCryptoPriceValid(0.1, 'USDC')).toBe(false);
        });
    });

    describe('getPriceStep', () => {
        it('returns 1 for whole number', () => {
            expect(getPriceStep('USDC')).toBe('1');
        });
        it('returns 0.0001 for native', () => {
            expect(getPriceStep('ETH')).toBe('0.0001');
        });
    });

    describe('getPricePlaceholder', () => {
        it('returns 1.00 for whole number', () => {
            expect(getPricePlaceholder('USDC')).toBe('1.00');
        });
        it('returns 0.0001 for native', () => {
            expect(getPricePlaceholder('ETH')).toBe('0.0001');
        });
    });
});
