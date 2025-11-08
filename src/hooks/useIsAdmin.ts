import { useEffect, useMemo, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { checkKeyOwnership } from '@/utils/lockUtils';
import { baseSepolia } from 'wagmi/chains';

interface UseIsAdminResult {
  isAdmin: boolean;
  loading: boolean;
  adminLockConfigured: boolean;
}

export function useIsAdmin(): UseIsAdminResult {
  const { wallets } = useWallets();
  const address = wallets?.[0]?.address;

  const adminLock = (import.meta as any).env?.VITE_ADMIN_LOCK_ADDRESS || (import.meta as any).env?.ADMIN_LOCK_ADDRESS;

  const chainId: number = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_PRIMARY_CHAIN_ID;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return baseSepolia.id; // default fallback
  }, []);

  const adminLockConfigured = Boolean(adminLock && typeof adminLock === 'string' && adminLock.length > 0);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // If no lock is configured or no wallet, we can exit early
      if (!adminLockConfigured || !address) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const ok = await checkKeyOwnership(adminLock as string, address as string, chainId);
        if (!cancelled) setIsAdmin(Boolean(ok));
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [address, adminLockConfigured, adminLock, chainId]);

  return { isAdmin, loading, adminLockConfigured };
}

