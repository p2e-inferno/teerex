import type { LinkedAccountWithMetadata } from '@privy-io/react-auth';
import { describe, expect, it } from 'vitest';
import { getPrivyExternalWalletLoginAccount } from '@/lib/wallet/privyWalletIdentity';

const date = (value: string) => new Date(value);

const walletAccount = (
  address: string,
  walletClientType: string,
  latestVerifiedAt?: Date | null
) =>
  ({
    type: 'wallet',
    address,
    chainType: 'ethereum',
    connectorType: walletClientType === 'privy' ? 'embedded' : 'injected',
    imported: false,
    delegated: false,
    walletClientType,
    walletIndex: walletClientType === 'privy' ? 0 : null,
    verifiedAt: date('2026-01-01T00:00:00.000Z'),
    firstVerifiedAt: date('2026-01-01T00:00:00.000Z'),
    latestVerifiedAt: latestVerifiedAt ?? null,
  }) as LinkedAccountWithMetadata;

const emailAccount = (latestVerifiedAt?: Date | null) =>
  ({
    type: 'email',
    address: 'user@example.com',
    verifiedAt: date('2026-01-01T00:00:00.000Z'),
    firstVerifiedAt: date('2026-01-01T00:00:00.000Z'),
    latestVerifiedAt: latestVerifiedAt ?? null,
  }) as LinkedAccountWithMetadata;

describe('getPrivyExternalWalletLoginAccount', () => {
  it('returns the external wallet for wallet-only logins', () => {
    const wallet = walletAccount('0xC1eA00000000000000000000000000000000A901', 'metamask');

    expect(getPrivyExternalWalletLoginAccount([wallet])).toBe(wallet);
  });

  it('does not treat an embedded Privy wallet as an external wallet login', () => {
    const wallet = walletAccount('0xC1eA00000000000000000000000000000000A901', 'privy');

    expect(getPrivyExternalWalletLoginAccount([wallet])).toBeNull();
  });

  it('returns null when a non-wallet account was the latest login account', () => {
    const wallet = walletAccount(
      '0xC1eA00000000000000000000000000000000A901',
      'metamask',
      date('2026-01-01T00:00:00.000Z')
    );
    const email = emailAccount(date('2026-01-02T00:00:00.000Z'));

    expect(getPrivyExternalWalletLoginAccount([wallet, email])).toBeNull();
  });

  it('returns null for linked email sessions when latest login metadata is unavailable', () => {
    const wallet = walletAccount('0xC1eA00000000000000000000000000000000A901', 'metamask');
    const email = emailAccount();

    expect(getPrivyExternalWalletLoginAccount([wallet, email])).toBeNull();
  });

  it('returns the external wallet when it was the latest login account', () => {
    const wallet = walletAccount(
      '0xC1eA00000000000000000000000000000000A901',
      'metamask',
      date('2026-01-02T00:00:00.000Z')
    );
    const email = emailAccount(date('2026-01-01T00:00:00.000Z'));

    expect(getPrivyExternalWalletLoginAccount([email, wallet])).toBe(wallet);
  });
});
