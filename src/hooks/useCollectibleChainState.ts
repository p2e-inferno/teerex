import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMaxKeysPerAddress, getTotalKeys, getUserKeyBalance } from '@/utils/lockUtils';

export function useCollectibleChainState(
  lockAddress: string | undefined,
  chainId: number | undefined,
  userAddresses: string[] = [],
) {
  const [sold, setSold] = useState(0);
  const [owned, setOwned] = useState(0);
  const [maxPerWallet, setMaxPerWallet] = useState(1);
  const [loading, setLoading] = useState(false);
  const addressesKey = userAddresses.map((address) => address.toLowerCase()).join('|');
  const addresses = useMemo(() => addressesKey ? addressesKey.split('|') : [], [addressesKey]);

  const refresh = useCallback(async () => {
    if (!lockAddress || !chainId) return;
    setLoading(true);
    try {
      const [nextSold, nextLimit, balances] = await Promise.all([
        getTotalKeys(lockAddress, chainId),
        getMaxKeysPerAddress(lockAddress, undefined, chainId),
        Promise.all(addresses.map((address) => getUserKeyBalance(lockAddress, address, chainId))),
      ]);
      setSold(nextSold);
      setMaxPerWallet(nextLimit || 1);
      setOwned(balances.reduce((sum, count) => sum + count, 0));
    } finally {
      setLoading(false);
    }
  }, [addresses, chainId, lockAddress]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { sold, owned, maxPerWallet, loading, refresh };
}
