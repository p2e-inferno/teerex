import { useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';

/**
 * Hook to collect all user wallet addresses (external wallets + embedded wallet)
 * Returns normalized (lowercased), deduplicated addresses
 */
export function useUserAddresses(): string[] {
  const { wallets } = useWallets();
  const { user } = usePrivy();

  return useMemo(() => {
    const fromWallets = (wallets || [])
      .map((wallet) => wallet?.address)
      .filter((addr): addr is string => Boolean(addr));
    const embedded = user?.wallet?.address ? [user.wallet.address] : [];
    const all = [...fromWallets, ...embedded].map((addr) => addr.toLowerCase());
    return Array.from(new Set(all));
  }, [wallets, user?.wallet?.address]);
}
