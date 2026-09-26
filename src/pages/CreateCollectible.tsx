import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/ui/rich-text/RichTextEditor';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { CollectibleImageUpload } from '@/components/collectibles/CollectibleImageUpload';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { useCollectiblePublisher } from '@/hooks/useCollectiblePublisher';
import { useToast } from '@/hooks/use-toast';
import { collectibleFormSchema, type CollectibleFormValues } from '@/types/collectible.schema';
import type { CryptoCurrency } from '@/types/currency';

export default function CreateCollectible() {
  const { authenticated } = usePrivy();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { networks, getAvailableTokens, isLoading: networksLoading } = useNetworkConfigs();
  const publisher = useCollectiblePublisher();
  const firstChain = networks[0]?.chain_id ?? 0;
  const [form, setForm] = useState<CollectibleFormValues>({
    name: '', description: '', imageUrl: '', chainId: firstChain, currency: 'ETH', price: 0,
    maxSupply: 10, maxKeysPerAddress: 1, isClaimable: false, fulfillmentNote: '',
  });

  const activeChain = form.chainId || firstChain;
  const tokens = useMemo(() => getAvailableTokens(activeChain), [activeChain, getAvailableTokens]);
  const update = (patch: Partial<CollectibleFormValues>) => setForm((current) => ({ ...current, ...patch }));
  const recovering = Boolean(publisher.pendingPersistence);
  const formDisabled = publisher.isPublishing || recovering;

  if (!authenticated) {
    return <WalletConnectionGate title="Connect to create a collectible" description="Sign in to publish creator collectibles on TeeRex." fullPage />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const normalized = { ...form, chainId: activeChain };
      collectibleFormSchema.parse(normalized);
      const collectible = await publisher.publish(normalized);
      toast({ title: 'Collectible published', description: 'Your limited edition is ready to share.' });
      navigate(`/collectible/${collectible.id}`);
    } catch (error: any) {
      const message = error?.issues?.[0]?.message || error?.message || 'Could not publish collectible.';
      toast({ title: 'Could not publish', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <form onSubmit={submit} className="container mx-auto grid max-w-5xl gap-8 px-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h1 className="text-3xl font-bold">Create a Collectible</h1>
          <p className="mt-2 text-muted-foreground">Turn a piece of your work into a limited digital edition supporters can collect.</p>
          <div className="mt-6"><CollectibleImageUpload value={form.imageUrl} onChange={(imageUrl) => update({ imageUrl })} disabled={formDisabled} /></div>
        </div>
        <Card>
          <CardHeader><CardTitle>Collectible details</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {publisher.pendingPersistence && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-medium">Finish the collectible already created on-chain</p>
                <p className="mt-1 text-amber-900/80">TeeRex saved this recovery state in your browser. Finish configuring and saving that exact lock before creating another collectible, even after a refresh.</p>
                <p className="mt-2 break-all text-xs text-amber-900/70">Lock: {publisher.pendingPersistence.lockAddress}</p>
                <Button type="button" variant="outline" className="mt-3" disabled={publisher.isPublishing} onClick={async () => { try { const item = await publisher.retryPersistence(); toast({ title: 'Collectible published', description: 'The existing on-chain lock was recovered successfully.' }); navigate(`/collectible/${item.id}`); } catch (error) { toast({ title: 'Publish retry failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); } }}>Retry publishing</Button>
              </div>
            )}
            <div className="space-y-2"><Label>Name *</Label><Input disabled={formDisabled} value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="Crochet Sunset Bag" /></div>
            <div className="space-y-2">
              <Label>Description</Label>
              <RichTextEditor value={form.description} onChange={(description) => update({ description })} placeholder="Tell collectors about this piece…" disabled={formDisabled} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Network *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={networksLoading || formDisabled} value={activeChain} onChange={(e) => { const chainId = Number(e.target.value); const available = getAvailableTokens(chainId); update({ chainId, currency: (available.includes(form.currency) ? form.currency : available[0]) as CryptoCurrency }); }}>{networks.map((network) => <option key={network.chain_id} value={network.chain_id}>{network.chain_name}</option>)}</select></div>
              <div className="space-y-2"><Label>Payment token *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={formDisabled || tokens.length === 0} value={form.currency} onChange={(e) => update({ currency: e.target.value as CryptoCurrency })}>{tokens.map((token) => <option key={token} value={token}>{token}</option>)}</select></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label>Price *</Label><Input type="number" min="0" step="any" disabled={formDisabled} value={form.price || ''} onChange={(e) => update({ price: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>Total available *</Label><Input type="number" min="1" step="1" disabled={formDisabled} value={form.maxSupply} onChange={(e) => update({ maxSupply: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>How many can one person buy?</Label><Input type="number" min="1" max={form.maxSupply} step="1" disabled={formDisabled} value={form.maxKeysPerAddress} onChange={(e) => update({ maxKeysPerAddress: Number(e.target.value) })} /><p className="text-xs text-muted-foreground">Default is 1. Raise it if supporters may collect more than one edition.</p></div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4"><div><Label>Physical item available</Label><p className="text-sm text-muted-foreground">Let collectors know a physical version can be arranged.</p></div><Switch disabled={formDisabled} checked={form.isClaimable} onCheckedChange={(isClaimable) => update({ isClaimable })} /></div>
              {form.isClaimable && <div className="mt-4 space-y-2"><Label>Fulfillment terms *</Label><RichTextEditor value={form.fulfillmentNote} onChange={(fulfillmentNote) => update({ fulfillmentNote })} placeholder="Available for delivery within Nigeria. International buyers cover shipping…" disabled={formDisabled} /></div>}
            </div>
            <Button type="submit" className="w-full" disabled={formDisabled || networksLoading || !activeChain || tokens.length === 0}>{recovering ? 'Finish existing publish first' : publisher.isPublishing ? 'Publishing…' : 'Publish Collectible'}</Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
