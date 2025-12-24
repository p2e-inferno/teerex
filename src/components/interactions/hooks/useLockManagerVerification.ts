import { useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { checkIfLockManager } from '@/utils/lockUtils';

interface UseLockManagerVerificationReturn {
  isLockManager: boolean;
  isChecking: boolean;
  error: Error | null;
}

export const useLockManagerVerification = (
  lockAddress: string,
  chainId: number
): UseLockManagerVerificationReturn => {
  const { wallets } = useWallets();
  const { user } = usePrivy();

  const [isLockManager, setIsLockManager] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const addresses = useMemo(() => {
    const fromWallets = (wallets || [])
      .map((wallet) => wallet?.address)
      .filter((addr): addr is string => Boolean(addr));
    const embedded = user?.wallet?.address ? [user.wallet.address] : [];
    const all = [...fromWallets, ...embedded].map((addr) => addr.toLowerCase());
    return Array.from(new Set(all));
  }, [wallets, user?.wallet?.address]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setIsChecking(true);
        setError(null);

        if (!lockAddress || !chainId || addresses.length === 0) {
          if (!cancelled) setIsLockManager(false);
          return;
        }

        const checks = await Promise.all(
          addresses.map((addr) => checkIfLockManager(lockAddress, addr, chainId))
        );

        if (!cancelled) {
          setIsLockManager(checks.some(Boolean));
        }
      } catch (e) {
        if (!cancelled) {
          setIsLockManager(false);
          setError(e instanceof Error ? e : new Error('Failed to check lock manager status'));
        }
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [addresses, lockAddress, chainId]);

  return { isLockManager, isChecking, error };
};
