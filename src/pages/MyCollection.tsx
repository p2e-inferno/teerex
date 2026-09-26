import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { CollectibleCard } from '@/components/collectibles/CollectibleCard';
import { useUserAddresses } from '@/hooks/useUserAddresses';
import { listCollectibles } from '@/lib/collectibles/collectibleApi';
import { getUserKeyBalance } from '@/utils/lockUtils';
import type { Collectible } from '@/types/collectible';

interface Owned { collectible: Collectible; quantity: number; }

async function loadPublicCollectibles() {
  const all: Collectible[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await listCollectibles({ page, pageSize: 48 });
    all.push(...result.collectibles);
    if (!result.has_more) break;
  }
  return all;
}

export default function MyCollection() {
  const { authenticated } = usePrivy();
  const addresses = useUserAddresses();
  const [owned, setOwned] = useState<Owned[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!authenticated || addresses.length === 0) { setOwned([]); setLoading(false); return; }
    setLoading(true);
    try {
      const all = await loadPublicCollectibles();
      const rows = await Promise.all(all.map(async (collectible) => {
        const balances = await Promise.all(addresses.map((address) => getUserKeyBalance(collectible.lock_address, address, collectible.chain_id)));
        return { collectible, quantity: balances.reduce((sum, count) => sum + count, 0) };
      }));
      setOwned(rows.filter((row) => row.quantity > 0));
    } finally { setLoading(false); }
  }, [authenticated, addresses.join('|')]);

  useEffect(() => { void load(); }, [load]);
  if (!authenticated) return <WalletConnectionGate title="Connect to view your collection" description="Collectibles you own across your linked wallets appear here." fullPage />;

  return (
    <div className="min-h-screen bg-gray-50 py-8"><div className="container mx-auto max-w-6xl px-6"><div className="mb-8"><h1 className="text-3xl font-bold">My Collection</h1><p className="mt-2 text-muted-foreground">Your TeeRex creator collectibles, verified from your wallets on-chain.</p></div>{loading ? <div className="py-16 text-center text-muted-foreground">Checking your wallets…</div> : owned.length === 0 ? <Card><CardContent className="py-16 text-center"><h2 className="text-xl font-semibold">Your collection is empty</h2><p className="mt-2 text-muted-foreground">Collect work from a creator and it will appear here.</p><Button asChild className="mt-6"><Link to="/explore?tab=collectibles">Explore Collectibles</Link></Button></CardContent></Card> : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{owned.map(({ collectible, quantity }) => <CollectibleCard key={collectible.id} collectible={collectible} ownedQuantity={quantity} showShare />)}</div>}</div></div>
  );
}
