import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveSigningWallet } from '@/hooks/useActiveSigningWallet';

const EMBEDDED = '0x00000000000000000000000000000000000000e1';
const LINKED_EXTERNAL = '0x00000000000000000000000000000000000000a1';
const UNLINKED_EXTERNAL = '0x00000000000000000000000000000000000000b1';

const state = vi.hoisted(() => ({
  authenticated: true,
  linked: [] as string[],
  wallets: [] as Array<{ address: string; walletClientType: string }>,
  active: undefined as { address: string } | undefined,
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    authenticated: state.authenticated,
    user: { linkedAccounts: state.linked.map((address) => ({ type: 'wallet', address })) },
  }),
  useWallets: () => ({ wallets: state.wallets }),
  useActiveWallet: () => ({ wallet: state.active }),
}));

const embedded = { address: EMBEDDED, walletClientType: 'privy' };
const linkedExternal = { address: LINKED_EXTERNAL, walletClientType: 'metamask' };
const unlinkedExternal = { address: UNLINKED_EXTERNAL, walletClientType: 'metamask' };

describe('useActiveSigningWallet', () => {
  beforeEach(() => {
    state.authenticated = true;
    state.linked = [EMBEDDED, LINKED_EXTERNAL];
    state.wallets = [unlinkedExternal, linkedExternal, embedded];
    state.active = undefined;
  });

  it('uses the active wallet when it is linked', () => {
    state.active = { address: LINKED_EXTERNAL };
    const { result } = renderHook(() => useActiveSigningWallet());
    expect(result.current?.address).toBe(LINKED_EXTERNAL);
  });

  it('never signs with an unlinked active wallet and falls back to the linked embedded wallet', () => {
    state.active = { address: UNLINKED_EXTERNAL };
    const { result } = renderHook(() => useActiveSigningWallet());
    expect(result.current?.address).toBe(EMBEDDED);
  });

  it('ignores an unlinked first connected wallet when nothing is active', () => {
    const { result } = renderHook(() => useActiveSigningWallet());
    expect(result.current?.address).toBe(EMBEDDED);
  });

  it('returns null when no linked wallet is connected or the user is signed out', () => {
    state.wallets = [unlinkedExternal];
    expect(renderHook(() => useActiveSigningWallet()).result.current).toBeNull();
    state.authenticated = false;
    state.wallets = [embedded];
    expect(renderHook(() => useActiveSigningWallet()).result.current).toBeNull();
  });
});
