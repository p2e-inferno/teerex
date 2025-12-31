import { useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { checkKeyOwnership } from '@/utils/lockUtils';
import { useVendorLockSettings } from './useVendorLockSettings';

interface UseIsVendorResult {
  isVendor: boolean;
  loading: boolean;
  vendorLockConfigured: boolean;
}

/**
 * Hook to check if current user is a vendor
 * Checks on-chain key ownership in vendor lock contract
 *
 * @returns Vendor status, loading state, and configuration status
 */
export function useIsVendor(): UseIsVendorResult {
  const { wallets } = useWallets();
  const address = wallets?.[0]?.address;
  const { data: settings, isLoading: settingsLoading } = useVendorLockSettings();

  const [isVendor, setIsVendor] = useState(false);
  const [loading, setLoading] = useState(false);

  const vendorLockConfigured = Boolean(settings?.lock_address);

  useEffect(() => {
    let cancelled = false;

    const checkVendorStatus = async () => {
      // If no lock configured or no wallet, exit early
      if (!vendorLockConfigured || !address || !settings) {
        setIsVendor(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const hasKey = await checkKeyOwnership(
          settings.lock_address,
          address,
          settings.chain_id
        );
        if (!cancelled) {
          setIsVendor(Boolean(hasKey));
        }
      } catch (error) {
        console.error('[useIsVendor] Error checking key ownership:', error);
        if (!cancelled) {
          setIsVendor(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkVendorStatus();

    return () => {
      cancelled = true;
    };
  }, [address, vendorLockConfigured, settings]);

  return {
    isVendor,
    loading: loading || settingsLoading,
    vendorLockConfigured,
  };
}
