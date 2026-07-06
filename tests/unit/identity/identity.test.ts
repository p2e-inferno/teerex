import { describe, expect, it } from 'vitest';
import { normalizeWalletAddress, resolveIdentityLabel, shortAddress } from '@/lib/identity';

describe('identity labels', () => {
  it('prefers ENS, then display name, then address', () => {
    expect(resolveIdentityLabel({
      ensName: 'alice.eth',
      displayName: 'Alice',
      address: '0x1111111111111111111111111111111111111111',
    })).toEqual({ label: 'alice.eth', source: 'ens' });

    expect(resolveIdentityLabel({
      displayName: 'Alice',
      address: '0x1111111111111111111111111111111111111111',
    })).toEqual({ label: 'Alice', source: 'displayName' });

    expect(resolveIdentityLabel({
      address: '0x1111111111111111111111111111111111111111',
    })).toEqual({ label: '0x1111...1111', source: 'address' });
  });

  it('normalizes valid wallet addresses and rejects invalid values', () => {
    expect(normalizeWalletAddress('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD')).toBe(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
    expect(normalizeWalletAddress('not-an-address')).toBeNull();
    expect(normalizeWalletAddress(null)).toBeNull();
  });

  it('shortens addresses without changing very short labels', () => {
    expect(shortAddress('0x1111111111111111111111111111111111111111')).toBe('0x1111...1111');
    expect(shortAddress('short')).toBe('short');
  });
});
