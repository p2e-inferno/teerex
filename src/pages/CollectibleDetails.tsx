import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PackageCheck, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IdentityName } from '@/components/identity/IdentityName';
import { CollectiblePurchaseDialog } from '@/components/collectibles/CollectiblePurchaseDialog';
import { useCollectibleChainState } from '@/hooks/useCollectibleChainState';
import { useUserAddresses } from '@/hooks/useUserAddresses';
import { useToast } from '@/hooks/use-toast';
import { getCollectible } from '@/lib/collectibles/collectibleApi';
import type { Collectible } from '@/types/collectible';

export default function CollectibleDetails() {
  const { id = '' } = useParams<{ id: string }>();
  const [collectible, setCollectible] = useState<Collectible | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const addresses = useUserAddresses();
  const { toast } = useToast();
  const chain = useCollectibleChainState(collectible?.lock_address, collectible?.chain_id, addresses);

  const load = async () => {
    setLoading(true);
    try {
      setCollectible(await getCollectible(id));
    } catch (error) {
      setCollectible(null);
      toast({ title: 'Collectible not found', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  if (loading) return <div className="container mx-auto max-w-6xl px-6 py-16 text-center text-muted-foreground">Loading collectible…</div>;
  if (!collectible) return <div className="container mx-auto max-w-3xl px-6 py-16"><Card><CardContent className="py-16 text-center">This collectible could not be found.</CardContent></Card></div>;

  const soldOut = chain.sold >= collectible.max_supply;
  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast({ title: 'Collectible link copied' });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-muted shadow-sm"><img src={collectible.image_url} alt={collectible.name} className="aspect-square w-full object-cover" /></div>
        <div className="space-y-6 py-2">
          <div className="flex flex-wrap gap-2">
            {soldOut && <Badge variant="secondary">Sold out</Badge>}
            {collectible.is_claimable && <Badge variant="outline"><PackageCheck className="mr-1 h-3 w-3" />Physical item available</Badge>}
          </div>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">{collectible.name}</h1>
            <p className="mt-2 text-muted-foreground">by <Link className="font-medium text-foreground hover:underline" to={`/u/${collectible.creator_address}?tab=created`}><IdentityName address={collectible.creator_address} displayName={collectible.creator_display_name} /></Link></p>
          </div>
          {collectible.description && <p className="whitespace-pre-wrap text-gray-700">{collectible.description}</p>}
          <div className="grid grid-cols-2 gap-4 rounded-xl border bg-white p-5 text-sm">
            <div><div className="text-muted-foreground">Price</div><div className="mt-1 text-lg font-semibold">{collectible.price} {collectible.currency}</div></div>
            <div><div className="text-muted-foreground">Collected</div><div className="mt-1 text-lg font-semibold">{Math.min(chain.sold, collectible.max_supply)} / {collectible.max_supply}</div></div>
            <div><div className="text-muted-foreground">Per person</div><div className="mt-1 font-medium">Up to {chain.maxPerWallet}</div></div>
            <div><div className="text-muted-foreground">Your collection</div><div className="mt-1 font-medium">{chain.owned} owned</div></div>
          </div>
          {collectible.is_claimable && (
            <Card><CardContent className="space-y-2 p-5"><div className="font-semibold">Physical item terms</div><p className="whitespace-pre-wrap text-sm text-muted-foreground">{collectible.fulfillment_note}</p></CardContent></Card>
          )}
          <div className="flex gap-3">
            <Button className="flex-1" size="lg" disabled={soldOut} onClick={() => setPurchaseOpen(true)}>{soldOut ? 'Sold out' : 'Collect'}</Button>
            <Button size="lg" variant="outline" onClick={share}><Share2 className="mr-2 h-4 w-4" />Share</Button>
          </div>
          <p className="text-xs text-muted-foreground">Purchases are crypto-only in V1 and mint Unlock Protocol NFT keys directly to your wallet.</p>
        </div>
      </div>
      <CollectiblePurchaseDialog collectible={collectible} open={purchaseOpen} onOpenChange={setPurchaseOpen} onPurchased={() => { void chain.refresh(); }} />
    </div>
  );
}
