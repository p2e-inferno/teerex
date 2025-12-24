import { useMemo, useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import type { UseCreatorPermissionsReturn } from '../types';

/**
 * Hook to check if the current user is the event creator
 * Compares user wallet addresses (and optionally Privy userId) with event creator data
 */
export const useCreatorPermissions = (
  creatorAddress?: string,
  creatorId?: string
): UseCreatorPermissionsReturn => {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const [isCreator, setIsCreator] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const addresses = useMemo(() => {
    const fromWallets = (wallets || [])
      .map((wallet) => wallet?.address)
      .filter((addr): addr is string => Boolean(addr));
    const embedded = user?.wallet?.address ? [user.wallet.address] : [];
    const all = [...fromWallets, ...embedded].map((addr) => addr.toLowerCase());
    return Array.from(new Set(all));
  }, [wallets, user?.wallet?.address]);

  useEffect(() => {
    setIsChecking(true);

    if (!authenticated || (!creatorAddress && !creatorId)) {
      setIsCreator(false);
      setIsChecking(false);
      return;
    }

    const matchByAddress = creatorAddress
      ? addresses.includes(creatorAddress.toLowerCase())
      : false;
    const matchById = creatorId && user?.id ? user.id === creatorId : false;
    const match = matchByAddress || matchById;

    setIsCreator(match);
    setIsChecking(false);
  }, [authenticated, creatorAddress, creatorId, addresses, user?.id]);

  return {
    isCreator,
    isChecking,
  };
};
