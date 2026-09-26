import { useCallback, useEffect, useState } from 'react';
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

  const refresh = useCallback(async () => {
    if (!lockAddress || !chainId) return;
    setLoading(true);
    try {
      const [nextSold, nextLimit, balances] = await Promise.all([
        getTotalKeys(lockAddress, chainId),
        getMaxKeysPerAddress(lockAddress, userAddresses[0], chainId),
        Promise.all(userAddresses.map((address) => getUserKeyBalance(lockAddress, address, chainId))),
      ]);
      setSold(nextSold);
      setMaxPerWallet(nextLimit || 1);
      setOwned(balances.reduce((sum, count) => sum + count, 0));
    } finally {
      setLoading(false);
    }
  }, [chainId, lockAddress, userAddresses.join('|')]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { sold, owned, maxPerWallet, loading, refresh };
}
