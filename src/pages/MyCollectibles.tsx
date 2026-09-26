import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Eye, Plus, Settings2, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { CollectibleCard } from '@/components/collectibles/CollectibleCard';
import { CollectibleManagementDialog } from '@/components/collectibles/CollectibleManagementDialog';
import { getMyCollectibles } from '@/lib/collectibles/collectibleApi';
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
  const [items, setItems] = useState<Collectible[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Collectible | null>(null);

  const load = useCallback(async () => {
    if (!authenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session unavailable.');
      setItems(await getMyCollectibles(token));
    } finally { setLoading(false); }
  }, [authenticated, getAccessToken]);

  useEffect(() => { void load(); }, [load]);
  if (!authenticated) return <WalletConnectionGate title="Connect to manage collectibles" description="Your published collectible editions appear here." fullPage />;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-6xl px-6">
        <div className="mb-8 flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">My Collectibles</h1><p className="mt-2 text-muted-foreground">Manage your work, see available creator funds, and share your collection.</p></div><Button onClick={() => navigate('/create-collectible')}><Plus className="mr-2 h-4 w-4" />Create Collectible</Button></div>
        {loading ? <div className="py-16 text-center text-muted-foreground">Loading your collectibles…</div> : items.length === 0 ? (
          <Card><CardContent className="py-16 text-center"><h2 className="text-xl font-semibold">No collectibles yet</h2><p className="mt-2 text-muted-foreground">Publish your first limited edition and share it with supporters.</p><Button className="mt-6" onClick={() => navigate('/create-collectible')}>Create your first collectible</Button></CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <CollectibleCard key={item.id} collectible={item} showShare footer={<div className="space-y-3 border-t pt-3"><Balance collectible={item} /><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => navigate(`/collectible/${item.id}`)}><Eye className="mr-2 h-4 w-4" />View</Button><Button variant="outline" onClick={() => setSelected(item)}><Settings2 className="mr-2 h-4 w-4" />Manage</Button></div></div>} />)}</div>
        )}
      </div>
      <CollectibleManagementDialog collectible={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} onUpdated={(updated) => { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); }} />
    </div>
  );
}
