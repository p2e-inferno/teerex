import { useActiveWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useUserAddresses } from '@/hooks/useUserAddresses';
import {
  getPreferredPrivyLinkedConnectedWallet,
  getPrivyWalletByAddress,
  isPrivyEmbeddedWallet,
  isPrivyWalletAccount,
  isPrivyWalletAddressLinked,
  normalizeWalletAddress,
  type PrivyWalletIdentitySource,
} from '@/lib/wallet/privyWalletIdentity';
import { useMemo } from 'react';

export type WalletType = 'embedded' | 'connected' | 'none';

export interface UserProfile {
  primaryAddress: string | undefined;
  allAddresses: string[];
  walletType: WalletType;
  user: ReturnType<typeof usePrivy>['user'];
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * User profile hook - aggregates user identity and wallet data
 *
 * Combines data from Privy authentication and wallet connections
 * to provide a unified view of the user's profile
 *
 * @returns User profile with primary address, all addresses, and wallet type
 *
 * @example
 * ```tsx
 * const { primaryAddress, allAddresses, walletType, isAuthenticated } = useUserProfile();
 *
 * if (!isAuthenticated) {
 *   return <div>Please connect wallet</div>;
 * }
 *
 * return (
 *   <div>
 *     <WalletIdentityCard
 *       address={primaryAddress!}
 *       walletType={walletType}
 *       allAddresses={allAddresses}
 *     />
 *   </div>
 * );
 * ```
 */
export function useUserProfile(): UserProfile {
  const { user, ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { wallet: activeWallet } = useActiveWallet();
  const userAddresses = useUserAddresses();
  const linkedWallets = useMemo(
    () => (user?.linkedAccounts ?? []).filter(isPrivyWalletAccount),
    [user?.linkedAccounts]
  );

  const primaryWallet = useMemo(() => {
    if (!authenticated) return undefined;

    const activeWalletSource = (activeWallet ?? null) as PrivyWalletIdentitySource | null;
    if (isPrivyWalletAddressLinked(user?.linkedAccounts, activeWalletSource?.address)) {
      return activeWalletSource ?? undefined;
    }

    return (
      getPreferredPrivyLinkedConnectedWallet(user?.linkedAccounts, wallets ?? []) ??
      user?.wallet ??
      linkedWallets[0] ??
      undefined
    );
  }, [activeWallet, authenticated, linkedWallets, user?.linkedAccounts, user?.wallet, wallets]);

  const primaryAddress = primaryWallet?.address ?? undefined;

  // Determine wallet type
  const walletType: WalletType = useMemo(() => {
    if (!primaryWallet?.address) return 'none';

    const matchingWallet =
      getPrivyWalletByAddress(wallets ?? [], primaryWallet.address) ??
      getPrivyWalletByAddress(linkedWallets, primaryWallet.address) ??
      (normalizeWalletAddress(user?.wallet?.address) === normalizeWalletAddress(primaryWallet.address)
        ? user?.wallet
        : undefined) ??
      primaryWallet;

    if (isPrivyEmbeddedWallet(matchingWallet)) {
      return 'embedded';
    }

    return 'connected';
  }, [linkedWallets, primaryWallet, wallets, user?.wallet]);

  return {
    primaryAddress,
    allAddresses: userAddresses,
    walletType,
    user,
    isLoading: !ready,
    isAuthenticated: authenticated,
  };
}
