
import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '../../../src/utils/emailUtils';

describe('emailUtils', () => {
    describe('normalizeEmail', () => {
        it('normalizes valid email', () => {
            expect(normalizeEmail('Test@Example.COM')).toBe('test@example.com');
            expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com');
        });

        it('returns null for invalid email', () => {
            expect(normalizeEmail('invalid-email')).toBeNull();
            expect(normalizeEmail('test@')).toBeNull();
            expect(normalizeEmail('@example.com')).toBeNull();
            expect(normalizeEmail('test@example')).toBeNull(); // Missing TLD
        });

        it('returns null for empty/null input', () => {
            expect(normalizeEmail('')).toBeNull();
            expect(normalizeEmail(null)).toBeNull();
            expect(normalizeEmail(undefined)).toBeNull();
            expect(normalizeEmail('   ')).toBeNull();
        });
    });
});
