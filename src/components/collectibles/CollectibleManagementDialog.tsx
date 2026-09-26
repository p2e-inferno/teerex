import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/ui/rich-text/RichTextEditor';
import { CollectibleImageUpload } from '@/components/collectibles/CollectibleImageUpload';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { useToast } from '@/hooks/use-toast';
import { isRichTextEmpty } from '@/lib/richText';
import { updateCollectible } from '@/lib/collectibles/collectibleApi';
import type { Collectible } from '@/types/collectible';
import { getBlockExplorerUrl, getLockWithdrawableBalance, withdrawLockBalance } from '@/utils/lockUtils';
import { getBaseTokenURI, TEEREX_NFT_SYMBOL } from '@/utils/lockMetadata';
import { ensureLockMetadata, setLockMaxKeysPerAddress, setLockMaxSupply, setLockPrice } from '@/utils/publicLockActions';

interface Props {
  collectible: Collectible | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (collectible: Collectible) => void;
}

export function CollectibleManagementDialog({ collectible, open, onOpenChange, onUpdated }: Props) {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { networks } = useNetworkConfigs();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReview, setWithdrawReview] = useState(false);
  const [withdrawExplorer, setWithdrawExplorer] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ formatted: string; raw: bigint; decimals: number } | null>(null);
  const [beneficiary, setBeneficiary] = useState('');
  const [form, setForm] = useState({ name: '', description: '', image_url: '', price: 0, max_supply: 1, max_keys_per_address: 1, is_claimable: false, fulfillment_note: '' });

  const creatorAddress = collectible?.creator_address?.toLowerCase();
  const preferred = user?.wallet?.address?.toLowerCase();
  const wallet = wallets.find((candidate) => candidate.address.toLowerCase() === creatorAddress)
    ?? wallets.find((candidate) => candidate.address.toLowerCase() === preferred)
    ?? wallets[0];
  const defaultBeneficiary = wallet?.address || '';
  const networkLabel = networks.find((network) => network.chain_id === collectible?.chain_id)?.chain_name || (collectible ? `Chain ${collectible.chain_id}` : 'Network');

  useEffect(() => {
    if (!collectible) return;
    setForm({
      name: collectible.name,
      description: collectible.description || '',
      image_url: collectible.image_url,
      price: collectible.price,
      max_supply: collectible.max_supply,
      max_keys_per_address: collectible.max_keys_per_address,
      is_claimable: collectible.is_claimable,
      fulfillment_note: collectible.fulfillment_note || '',
    });
    setBeneficiary(defaultBeneficiary);
    setWithdrawReview(false);
    setWithdrawExplorer(null);
  }, [collectible?.id, defaultBeneficiary, open]);

  const refreshBalance = async () => {
    if (!collectible) return;
    try {
      const current = await getLockWithdrawableBalance(collectible.lock_address, collectible.chain_id);
      setBalance({ raw: current.balance, decimals: current.decimals, formatted: ethers.formatUnits(current.balance, current.decimals) });
    } catch (error) {
      setBalance(null);
      toast({ title: 'Could not read lock balance', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  useEffect(() => { if (open && collectible) void refreshBalance(); }, [open, collectible?.id]);

  const changed = useMemo(() => collectible && (
    form.name !== collectible.name || form.description !== (collectible.description || '') || form.image_url !== collectible.image_url ||
    form.price !== collectible.price || form.max_supply !== collectible.max_supply || form.max_keys_per_address !== collectible.max_keys_per_address ||
    form.is_claimable !== collectible.is_claimable || form.fulfillment_note !== (collectible.fulfillment_note || '')
  ), [collectible, form]);

  if (!collectible) return null;

  const save = async () => {
    if (!wallet) return toast({ title: 'Connect the creator wallet first', variant: 'destructive' });
    if (!form.name.trim() || !form.image_url) return toast({ title: 'Name and artwork are required', variant: 'destructive' });
    if (!Number.isFinite(form.price) || form.price <= 0) return toast({ title: 'Price must be greater than zero', variant: 'destructive' });
    if (!Number.isInteger(form.max_supply) || form.max_supply < 1) return toast({ title: 'Supply must be a positive whole number', variant: 'destructive' });
    if (form.is_claimable && isRichTextEmpty(form.fulfillment_note)) return toast({ title: 'Add physical item fulfillment terms', variant: 'destructive' });
    if (!Number.isInteger(form.max_keys_per_address) || form.max_keys_per_address < 1 || form.max_keys_per_address > form.max_supply) return toast({ title: 'Per-person limit must fit within total supply', variant: 'destructive' });

    setSaving(true);
    try {
      if (form.name.trim() !== collectible.name) {
        const metadata = await ensureLockMetadata(
          collectible.lock_address,
          form.name.trim(),
          TEEREX_NFT_SYMBOL,
          collectible.nft_base_uri || getBaseTokenURI(collectible.lock_address),
          wallet,
          collectible.chain_id,
        );
        if (!metadata.success) throw new Error(metadata.error);
      }

      if (form.price !== collectible.price) {
        const result = await setLockPrice(collectible.lock_address, form.price, collectible.currency, wallet, collectible.chain_id);
        if (!result.success) throw new Error(result.error);
      }

      const lowerLimitFirst = form.max_supply < collectible.max_keys_per_address && form.max_keys_per_address !== collectible.max_keys_per_address;
      if (lowerLimitFirst) {
        const limit = await setLockMaxKeysPerAddress(collectible.lock_address, form.max_keys_per_address, wallet, collectible.chain_id);
        if (!limit.success) throw new Error(limit.error);
      }
      if (form.max_supply !== collectible.max_supply) {
        const supply = await setLockMaxSupply(collectible.lock_address, form.max_supply, wallet, collectible.chain_id);
        if (!supply.success) throw new Error(supply.error);
      }
      if (!lowerLimitFirst && form.max_keys_per_address !== collectible.max_keys_per_address) {
        const limit = await setLockMaxKeysPerAddress(collectible.lock_address, form.max_keys_per_address, wallet, collectible.chain_id);
        if (!limit.success) throw new Error(limit.error);
      }

      const token = await getAccessToken();
      if (!token) throw new Error('Your session expired.');
      const updated = await updateCollectible(collectible.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url,
        price: form.price,
        max_supply: form.max_supply,
        max_keys_per_address: form.max_keys_per_address,
        is_claimable: form.is_claimable,
        fulfillment_note: form.fulfillment_note.trim() || null,
      }, token);
      onUpdated(updated);
      toast({ title: 'Collectible updated' });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Update incomplete', description: `${error instanceof Error ? error.message : 'Try again.'} Confirmed on-chain values are retry-safe; use Save again to finish the TeeRex sync.`, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const reviewWithdrawal = () => {
    if (!wallet) return toast({ title: 'Connect the creator wallet first', variant: 'destructive' });
    if (!ethers.isAddress(beneficiary)) return toast({ title: 'Enter a valid withdrawal address', variant: 'destructive' });
    if (!balance || balance.raw <= 0n) return toast({ title: 'No funds are available to withdraw' });
    setWithdrawReview(true);
  };

  const withdraw = async () => {
    if (!wallet || !ethers.isAddress(beneficiary) || !balance || balance.raw <= 0n) return;
    setWithdrawing(true);
    try {
      const result = await withdrawLockBalance(collectible.lock_address, beneficiary, wallet, collectible.chain_id);
      if (!result.success) throw new Error(result.error);
      const explorer = result.transactionHash ? await getBlockExplorerUrl(result.transactionHash, collectible.chain_id) : null;
      setWithdrawExplorer(explorer);
      setWithdrawReview(false);
      await refreshBalance();
      toast({ title: 'Funds withdrawn', description: 'The lock balance has been sent to your chosen address.' });
    } catch (error) {
      toast({ title: 'Withdrawal failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Manage {collectible.name}</DialogTitle><DialogDescription>Update the listing, on-chain price/supply settings, or withdraw creator funds.</DialogDescription></DialogHeader>
        <div className="space-y-6">
          <CollectibleImageUpload value={form.image_url} onChange={(image_url) => setForm((f) => ({ ...f, image_url }))} disabled={saving} />
          <div className="space-y-2"><Label>Name</Label><Input disabled={saving} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Description</Label><RichTextEditor value={form.description} onChange={(description) => setForm((f) => ({ ...f, description }))} disabled={saving} /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>Price ({collectible.currency})</Label><Input type="number" min="0" step="any" disabled={saving} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>Total supply</Label><Input type="number" min="1" step="1" disabled={saving} value={form.max_supply} onChange={(e) => setForm((f) => ({ ...f, max_supply: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>How many can one person buy?</Label><Input type="number" min="1" max={form.max_supply} step="1" disabled={saving} value={form.max_keys_per_address} onChange={(e) => setForm((f) => ({ ...f, max_keys_per_address: Number(e.target.value) }))} /></div>
          </div>
          <div className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><Label>Physical item available</Label><p className="text-sm text-muted-foreground">Describe how a collector can arrange fulfillment.</p></div><Switch disabled={saving} checked={form.is_claimable} onCheckedChange={(is_claimable) => setForm((f) => ({ ...f, is_claimable }))} /></div>{form.is_claimable && <div className="mt-3"><RichTextEditor value={form.fulfillment_note} onChange={(fulfillment_note) => setForm((f) => ({ ...f, fulfillment_note }))} placeholder="Describe delivery regions, shipping responsibility, and how the collector should arrange fulfillment." disabled={saving} /></div>}</div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-4"><div><div className="font-semibold">Creator funds</div><p className="text-sm text-muted-foreground">Purchases remain in the Unlock lock until a lock manager withdraws them.</p></div><Button size="icon" variant="ghost" disabled={saving || withdrawing} onClick={refreshBalance}><RefreshCw className="h-4 w-4" /></Button></div>
            <div className="mt-4 text-2xl font-bold">{balance ? `${balance.formatted} ${collectible.currency}` : '—'}</div>
            {!withdrawReview ? (
              <>
                <div className="mt-4 space-y-2"><Label>Withdraw to</Label><Input disabled={saving || withdrawing} value={beneficiary} onChange={(e) => { setBeneficiary(e.target.value); setWithdrawExplorer(null); }} placeholder={defaultBeneficiary || '0x…'} /><p className="text-xs text-muted-foreground">Defaults to your connected creator wallet. Replace it with any valid address you control if needed.</p></div>
                <Button className="mt-4" variant="outline" disabled={saving || withdrawing || !balance || balance.raw <= 0n} onClick={reviewWithdrawal}>Review withdrawal</Button>
              </>
            ) : (
              <div className="mt-4 space-y-3 rounded-lg border bg-background p-4 text-sm">
                <div className="font-semibold">Confirm withdrawal</div>
                <div className="grid gap-2">
                  <div><span className="text-muted-foreground">Amount:</span> {balance?.formatted} {collectible.currency}</div>
                  <div><span className="text-muted-foreground">Network:</span> {networkLabel}</div>
                  <div className="break-all"><span className="text-muted-foreground">To:</span> {beneficiary}</div>
                </div>
                <p className="text-xs text-muted-foreground">Check the address carefully. This wallet transaction sends the full available lock balance.</p>
                <div className="flex gap-2"><Button size="sm" variant="outline" disabled={withdrawing} onClick={() => setWithdrawReview(false)}>Back</Button><Button size="sm" disabled={withdrawing} onClick={withdraw}>{withdrawing ? 'Withdrawing…' : 'Confirm withdrawal'}</Button></div>
              </div>
            )}
            {withdrawExplorer && <a className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline" href={withdrawExplorer} target="_blank" rel="noreferrer">View withdrawal transaction <ExternalLink className="ml-1 h-3 w-3" /></a>}
          </div>
          <p className="text-xs text-muted-foreground">Network and payment token cannot be changed after publishing in V1. On-chain settings and withdrawals are signed by your connected lock-manager wallet.</p>
        </div>
        <DialogFooter><Button variant="outline" disabled={saving || withdrawing} onClick={() => onOpenChange(false)}>Close</Button><Button disabled={saving || withdrawing || !changed} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
