import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useUserAddresses } from '@/hooks/useUserAddresses';
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
  const userAddresses = useUserAddresses();

  // Determine primary address (first connected wallet or embedded wallet)
  const primaryAddress = useMemo(() => {
    if (wallets && wallets.length > 0) {
      return wallets[0].address;
    }
    if (user?.wallet?.address) {
      return user.wallet.address;
    }
    return undefined;
  }, [wallets, user]);

  // Determine wallet type
  const walletType: WalletType = useMemo(() => {
    if (!primaryAddress) return 'none';

    // If user has connected wallets (via MetaMask, WalletConnect, etc.)
    if (wallets && wallets.length > 0) {
      return 'connected';
    }

    // If user only has Privy embedded wallet
    if (user?.wallet?.address) {
      return 'embedded';
    }

    return 'none';
  }, [primaryAddress, wallets, user]);

  return {
    primaryAddress,
    allAddresses: userAddresses,
    walletType,
    user,
    isLoading: !ready,
    isAuthenticated: authenticated,
  };
}
