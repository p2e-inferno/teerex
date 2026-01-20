
import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff, isRetryableTransactionError } from '../../../supabase/functions/_shared/retry-helper';

describe('retry-helper', () => {
    describe('isRetryableTransactionError', () => {
        it('identifies non-retryable errors correctly', () => {
            const errors = [
                new Error('insufficient funds for gas'),
                new Error('execution reverted: bad things'),
                new Error('user rejected transaction'),
            ];
            errors.forEach(err => {
                expect(isRetryableTransactionError(err)).toBe(false);
            });
        });

        it('identifies retryable errors correctly', () => {
            const errors = [
                new Error('nonce too low'),
                new Error('network timeout'),
                new Error('ETIMEDOUT'),
                new Error('replacement fee too low'),
            ];
            errors.forEach(err => {
                expect(isRetryableTransactionError(err)).toBe(true);
            });
        });

        it('handles unknowns as retryable if not explicitly banned (conservative approach) or checks logic', () => {
            // The current logic defaults to false if not in retryable list? 
            // Let's check the code:
            // if nonRetryable -> return false
            // if retryable -> return true
            // return false (implicit fallthrough?)
            // Wait, the code ends with: return retryablePatterns.some(...)
            // So unknown errors return FALSE.
            expect(isRetryableTransactionError(new Error('completely unknown error'))).toBe(false);
        });
    });

    describe('retryWithBackoff', () => {
        it('returns result immediately if successful', async () => {
            const operation = vi.fn().mockResolvedValue('success');
            const result = await retryWithBackoff(operation, {
                maxAttempts: 3,
                initialDelay: 10,
                backoffMultiplier: 2,
                maxDelay: 100,
            });
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('retries on failure and eventually succeeds', async () => {
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockResolvedValue('success');

            const result = await retryWithBackoff(operation, {
                maxAttempts: 3,
                initialDelay: 10,
                backoffMultiplier: 2,
                maxDelay: 100,
            });
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('fails if max attempts exceeded', async () => {
            const operation = vi.fn().mockRejectedValue(new Error('persist fail'));

            await expect(retryWithBackoff(operation, {
                maxAttempts: 3,
                initialDelay: 10,
                backoffMultiplier: 2,
                maxDelay: 100,
            })).rejects.toThrow('persist fail');

            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('respects shouldRetry predicate', async () => {
            const operation = vi.fn().mockRejectedValue(new Error('fatal error'));
            const shouldRetry = (err: any) => err.message !== 'fatal error';

            await expect(retryWithBackoff(operation, {
                maxAttempts: 3,
                initialDelay: 10,
                backoffMultiplier: 2,
                maxDelay: 100,
                shouldRetry,
            })).rejects.toThrow('fatal error');

            expect(operation).toHaveBeenCalledTimes(1); // Should abort immediately
        });
    });
});
