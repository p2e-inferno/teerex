import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { CollectibleCard } from '@/components/collectibles/CollectibleCard';
import { useUserAddresses } from '@/hooks/useUserAddresses';
import { useToast } from '@/hooks/use-toast';
import { listAllCollectibles } from '@/lib/collectibles/collectibleApi';
import { resolveOwnedCollectibles, type OwnedCollectible } from '@/lib/collectibles/ownership';

export default function MyCollection() {
  const { authenticated } = usePrivy();
  const rawAddresses = useUserAddresses();
  const { toast } = useToast();
  const addressesKey = rawAddresses.map((address) => address.toLowerCase()).join('|');
  const addresses = useMemo(() => addressesKey ? addressesKey.split('|') : [], [addressesKey]);
  const [owned, setOwned] = useState<OwnedCollectible[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authenticated || addresses.length === 0) { setOwned([]); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const all = await listAllCollectibles();
      const result = await resolveOwnedCollectibles(all, addresses);
      setOwned(result.owned);
      if (result.failedChecks > 0) {
        toast({
          title: 'Collection partially refreshed',
          description: `${result.failedChecks} on-chain ownership check${result.failedChecks === 1 ? '' : 's'} could not be completed. Your confirmed collectibles are still shown.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again.';
      setLoadError(message);
      toast({ title: 'Could not load your collection', description: message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [addresses, authenticated, toast]);

  useEffect(() => { void load(); }, [load]);
  if (!authenticated) return <WalletConnectionGate title="Connect to view your collection" description="Collectibles you own across your linked wallets appear here." fullPage />;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-6xl px-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div><h1 className="text-3xl font-bold">My Collection</h1><p className="mt-2 text-muted-foreground">Your TeeRex creator collectibles, verified from your linked wallets on-chain.</p></div>
          {!loading && <Button variant="outline" onClick={() => { void load(); }}>Refresh</Button>}
        </div>
        {loading ? <div className="py-16 text-center text-muted-foreground">Checking your wallets…</div> : loadError ? (
          <Card><CardContent className="py-16 text-center"><h2 className="text-xl font-semibold">Could not refresh your collection</h2><p className="mt-2 text-muted-foreground">{loadError}</p><Button className="mt-6" onClick={() => { void load(); }}>Try again</Button></CardContent></Card>
        ) : owned.length === 0 ? (
          <Card><CardContent className="py-16 text-center"><h2 className="text-xl font-semibold">Your collection is empty</h2><p className="mt-2 text-muted-foreground">Collect work from a creator and it will appear here.</p><Button asChild className="mt-6"><Link to="/explore?tab=collectibles">Explore Collectibles</Link></Button></CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{owned.map(({ collectible, quantity }) => <CollectibleCard key={collectible.id} collectible={collectible} ownedQuantity={quantity} showShare />)}</div>
        )}
      </div>
    </div>
  );
}
