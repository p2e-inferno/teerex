
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyVendor, getVerificationStrategy } from '../../../supabase/functions/_shared/verification';
import * as paystack from '../../../supabase/functions/_shared/paystack';

// Mock paystack module
vi.mock('../../../supabase/functions/_shared/paystack', () => ({
    verifyAccountNumber: vi.fn(),
    isValidNigerianAccountNumber: vi.fn(() => true)
}));

describe('verification', () => {
    describe('getVerificationStrategy', () => {
        it('defaults to paystack_account', () => {
            expect(getVerificationStrategy()).toBe('paystack_account');
        });

        it('reads from environment', () => {
            // Deno global is already mocked in setup.ts
            vi.stubEnv('VENDOR_VERIFICATION_STRATEGY', 'manual');
            expect(getVerificationStrategy()).toBe('manual');
            vi.unstubAllEnvs();
        });
    });

    describe('verifyVendor', () => {
        const ctx = {
            vendor_id: 'v1',
            provider: 'p1',
            business_name: 'Biz',
            settlement_bank_code: '001',
            account_number: '1234567890'
        };

        it('handles paystack_account strategy success', async () => {
            vi.mocked(paystack.verifyAccountNumber).mockResolvedValue({
                status: true,
                message: 'ok',
                data: {
                    account_name: 'John Doe',
                    bank_id: 1,
                    account_number: '1234567890'
                }
            });

            const result = await verifyVendor(ctx, 'paystack_account');
            expect(result.verified).toBe(true);
            expect(result.metadata?.account_name).toBe('John Doe');
        });

        it('handles paystack_account strategy failure', async () => {
            vi.mocked(paystack.verifyAccountNumber).mockRejectedValue(new Error('Could not resolve account name'));

            const result = await verifyVendor(ctx, 'paystack_account');
            expect(result.verified).toBe(false);
            expect(result.retryHint).toContain('Account number not found');
        });

        it('handles manual strategy', async () => {
            const result = await verifyVendor(ctx, 'manual');
            expect(result.verified).toBe(false);
            expect(result.error).toContain('manual review');
        });

        it('validates account number format before calling api', async () => {
            const invalidCtx = { ...ctx, account_number: '123' };
            const result = await verifyVendor(invalidCtx, 'paystack_account');
            expect(result.verified).toBe(false);
            expect(result.error).toContain('Invalid account number format');
            expect(paystack.verifyAccountNumber).not.toHaveBeenCalled();
        });
    });
});
