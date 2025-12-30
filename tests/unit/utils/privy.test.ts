
import { describe, it, expect, vi, beforeEach } from 'vitest';

// MOCK THE URL IMPORT !!!
// This is critical for Node compatibility
vi.mock('https://deno.land/x/jose@v4.14.4/index.ts', () => ({
    createRemoteJWKSet: vi.fn(),
    jwtVerify: vi.fn(),
    importSPKI: vi.fn()
}));

// We must import the module AFTER the mock is defined? 
// No, vi.mock is hoisted.
import { verifyPrivyToken, validateUserWallet, getUserWalletAddresses } from '../../../supabase/functions/_shared/privy';
import { jwtVerify, createRemoteJWKSet } from 'https://deno.land/x/jose@v4.14.4/index.ts';

// Mock fetch
const globalFetch = global.fetch;
const mockFetch = vi.fn();

describe('privy utils', () => {
    beforeEach(() => {
        global.fetch = mockFetch;
        vi.stubEnv('VITE_PRIVY_APP_ID', 'test-app-id');
        vi.stubEnv('PRIVY_APP_SECRET', 'test-secret');
        vi.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = globalFetch;
        vi.unstubAllEnvs();
    });

    describe('verifyPrivyToken', () => {
        it('verifies valid token', async () => {
            vi.mocked(jwtVerify).mockResolvedValue({
                payload: { sub: 'did:privy:123' },
                protectedHeader: {}
            });

            const userId = await verifyPrivyToken('Bearer token123');
            expect(userId).toBe('did:privy:123');
            expect(jwtVerify).toHaveBeenCalled();
        });

        it('throws on missing header', async () => {
            await expect(verifyPrivyToken(null)).rejects.toThrow('Missing or invalid');
        });
    });

    describe('getUserWalletAddresses', () => {
        it('fetches and parses wallets', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    wallets: [{ address: '0x1234567890123456789012345678901234567890' }],
                    linked_accounts: [{ type: 'wallet', address: '0x0987654321098765432109876543210987654321' }]
                })
            });

            const wallets = await getUserWalletAddresses('user1');
            expect(wallets).toHaveLength(2);
            expect(wallets).toContain('0x1234567890123456789012345678901234567890');
        });

        it('throws if secret is missing', async () => {
            vi.stubEnv('PRIVY_APP_SECRET', '');
            await expect(getUserWalletAddresses('user1')).rejects.toThrow('Privy app secret not configured');
        });
    });
});
