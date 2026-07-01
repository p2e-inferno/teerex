import { useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { isPrivyWalletAccount } from '@/lib/wallet/privyWalletIdentity';

/**
 * Hook to collect user-owned wallet addresses (linked external wallets + embedded wallet)
 * Returns normalized (lowercased), deduplicated addresses
 */
export function useUserAddresses(): string[] {
  const { authenticated, user } = usePrivy();

  return useMemo(() => {
    if (!authenticated) return [];

    const linkedWallets = (user?.linkedAccounts ?? [])
      .filter(isPrivyWalletAccount)
      .map((wallet) => wallet.address)
      .filter((addr): addr is string => Boolean(addr));
    const embedded = user?.wallet?.address ? [user.wallet.address] : [];
    const all = [...linkedWallets, ...embedded].map((addr) => addr.toLowerCase());
    return Array.from(new Set(all));
  }, [authenticated, user?.linkedAccounts, user?.wallet?.address]);
}
