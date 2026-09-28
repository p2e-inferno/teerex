import { useMemo } from 'react';
import { useActiveWallet, usePrivy, useWallets, type ConnectedWallet } from '@privy-io/react-auth';
import {
  getPreferredPrivyLinkedConnectedWallet,
  getPrivyWalletByAddress,
  isPrivyWalletAddressLinked,
} from '@/lib/wallet/privyWalletIdentity';

// Resolves from the EVM wallets list so callers always get a signer-capable ConnectedWallet.
export function useActiveSigningWallet(): ConnectedWallet | null {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { wallet: activeWallet } = useActiveWallet();

  return useMemo(() => {
    if (!authenticated) return null;
    const active = getPrivyWalletByAddress(wallets, activeWallet?.address);
    if (active && isPrivyWalletAddressLinked(user?.linkedAccounts, active.address)) return active;
    return getPreferredPrivyLinkedConnectedWallet(user?.linkedAccounts, wallets);
  }, [activeWallet?.address, authenticated, user?.linkedAccounts, wallets]);
}
