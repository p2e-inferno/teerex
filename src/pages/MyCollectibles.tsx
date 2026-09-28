import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Link, useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Eye, Plus, Settings2, Store, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { CollectibleCard } from '@/components/collectibles/CollectibleCard';
import { CollectibleManagementDialog } from '@/components/collectibles/CollectibleManagementDialog';
import { IdentityName } from '@/components/identity/IdentityName';
import { ShareButton } from '@/components/interactions/ShareButton';
import { useToast } from '@/hooks/use-toast';
import { getMyCollectibles } from '@/lib/collectibles/collectibleApi';
import { profilePath, profileShareUrl } from '@/lib/shareUrls';
import { getLockWithdrawableBalance } from '@/utils/lockUtils';
import type { Collectible } from '@/types/collectible';

function Balance({ collectible }: { collectible: Collectible }) {
  const [value, setValue] = useState<string>('…');
  useEffect(() => {
    let active = true;
    getLockWithdrawableBalance(collectible.lock_address, collectible.chain_id).then((balance) => {
      if (active) setValue(ethers.formatUnits(balance.balance, balance.decimals));
    }).catch(() => active && setValue('Unavailable'));
    return () => { active = false; };
  }, [collectible.id, collectible.updated_at]);
  return <div className="flex items-center gap-2 text-sm text-muted-foreground"><WalletCards className="h-4 w-4" />Available: <span className="font-medium text-foreground">{value} {value === 'Unavailable' ? '' : collectible.currency}</span></div>;
}

export default function MyCollectibles() {
  const { authenticated, getAccessToken } = usePrivy();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<Collectible[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Collectible | null>(null);

  const load = useCallback(async () => {
    if (!authenticated) { setItems([]); setLoadError(null); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session unavailable.');
      setItems(await getMyCollectibles(token));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again.';
      setLoadError(message);
      toast({ title: 'Could not load your collectibles', description: message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [authenticated, getAccessToken, toast]);

  useEffect(() => { void load(); }, [load]);
  const storefrontAddresses = useMemo(
    () => [...new Set(items.map((item) => item.creator_address.toLowerCase()))],
    [items],
  );
  if (!authenticated) return <WalletConnectionGate title="Connect to manage collectibles" description="Your published collectible editions appear here." fullPage />;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-6xl px-6">
        <div className="mb-8 flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">My Collectibles</h1><p className="mt-2 text-muted-foreground">Manage your work, see available creator funds, and share your collection.</p></div><Button onClick={() => navigate('/create-collectible')}><Plus className="mr-2 h-4 w-4" />Create Collectible</Button></div>
        {storefrontAddresses.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-3">
            {storefrontAddresses.map((address) => (
              <div key={address} className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link to={profilePath(address, 'created')}>
                    <Store className="mr-2 h-4 w-4" />
                    View Storefront
                    {storefrontAddresses.length > 1 && <span className="ml-1 text-muted-foreground">(<IdentityName address={address} />)</span>}
                  </Link>
                </Button>
                <ShareButton url={profileShareUrl(address, 'created')} title="My storefront on TeeRex" copiedMessage="Storefront link copied to clipboard" variant="outline" size="icon" />
              </div>
            ))}
          </div>
        )}
        {loading ? <div className="py-16 text-center text-muted-foreground">Loading your collectibles…</div> : loadError ? (
          <Card><CardContent className="py-16 text-center"><h2 className="text-xl font-semibold">Could not load your collectibles</h2><p className="mt-2 text-muted-foreground">{loadError}</p><Button className="mt-6" variant="outline" onClick={() => { void load(); }}>Try again</Button></CardContent></Card>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-16 text-center"><h2 className="text-xl font-semibold">No collectibles yet</h2><p className="mt-2 text-muted-foreground">Publish your first limited edition and share it with supporters.</p><Button className="mt-6" onClick={() => navigate('/create-collectible')}>Create your first collectible</Button></CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <CollectibleCard key={item.id} collectible={item} showShare footer={<div className="space-y-3 border-t pt-3"><Balance collectible={item} /><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => navigate(`/collectible/${item.id}`)}><Eye className="mr-2 h-4 w-4" />View</Button><Button variant="outline" onClick={() => setSelected(item)}><Settings2 className="mr-2 h-4 w-4" />Manage</Button></div></div>} />)}</div>
        )}
      </div>
      <CollectibleManagementDialog collectible={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} onUpdated={(updated) => { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); }} />
    </div>
  );
}
