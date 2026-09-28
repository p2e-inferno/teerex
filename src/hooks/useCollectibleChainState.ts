import { useCallback, useEffect, useMemo, useState } from 'react';
import { readCollectibleChainState } from '@/lib/collectibles/chainState';

export function useCollectibleChainState(
  lockAddress: string | undefined,
  chainId: number | undefined,
  userAddresses: string[] = [],
) {
  const [sold, setSold] = useState(0);
  const [owned, setOwned] = useState(0);
  const [maxPerWallet, setMaxPerWallet] = useState(1);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const addressesKey = userAddresses.map((address) => address.toLowerCase()).join('|');
  const addresses = useMemo(() => addressesKey ? addressesKey.split('|') : [], [addressesKey]);

  const refresh = useCallback(async () => {
    if (!lockAddress || !chainId) {
      setReady(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const state = await readCollectibleChainState(lockAddress, chainId, addresses);
      setSold(state.sold);
      setMaxPerWallet(state.maxPerWallet);
      setOwned(state.owned);
      setReady(true);
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error('Could not read collectible contract state.');
      setError(nextError);
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, [addresses, chainId, lockAddress]);

  useEffect(() => {
    setReady(false);
    setError(null);
    void refresh();
  }, [refresh]);

  return { sold, owned, maxPerWallet, loading, ready, error, refresh };
}
