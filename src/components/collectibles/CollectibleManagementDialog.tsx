import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CollectibleImageUpload } from '@/components/collectibles/CollectibleImageUpload';
import { useToast } from '@/hooks/use-toast';
import { updateCollectible } from '@/lib/collectibles/collectibleApi';
import type { Collectible } from '@/types/collectible';
import { getBlockExplorerUrl, getLockWithdrawableBalance, withdrawLockBalance } from '@/utils/lockUtils';
import { setLockMaxKeysPerAddress, setLockMaxSupply, setLockPrice } from '@/utils/publicLockActions';

interface Props {
  collectible: Collectible | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (collectible: Collectible) => void;
}

export function CollectibleManagementDialog({ collectible, open, onOpenChange, onUpdated }: Props) {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [balance, setBalance] = useState<{ formatted: string; raw: bigint; decimals: number } | null>(null);
  const [beneficiary, setBeneficiary] = useState('');
  const [form, setForm] = useState({ name: '', description: '', image_url: '', price: 0, max_supply: 1, max_keys_per_address: 1, is_claimable: false, fulfillment_note: '' });

  const preferred = user?.wallet?.address?.toLowerCase();
  const wallet = wallets.find((candidate) => candidate.address.toLowerCase() === preferred) ?? wallets[0];
  const defaultBeneficiary = wallet?.address || '';

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
    if (form.is_claimable && !form.fulfillment_note.trim()) return toast({ title: 'Add physical item fulfillment terms', variant: 'destructive' });
    if (form.max_keys_per_address < 1 || form.max_keys_per_address > form.max_supply) return toast({ title: 'Per-person limit must fit within total supply', variant: 'destructive' });

    setSaving(true);
    try {
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
      toast({ title: 'Update incomplete', description: `${error instanceof Error ? error.message : 'Try again.'} If an on-chain change already confirmed, reopen Manage and retry the TeeRex sync rather than repeating that transaction.`, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (!wallet) return toast({ title: 'Connect the creator wallet first', variant: 'destructive' });
    if (!ethers.isAddress(beneficiary)) return toast({ title: 'Enter a valid withdrawal address', variant: 'destructive' });
    if (!balance || balance.raw <= 0n) return toast({ title: 'No funds are available to withdraw' });
    setWithdrawing(true);
    try {
      const result = await withdrawLockBalance(collectible.lock_address, beneficiary, wallet, collectible.chain_id);
      if (!result.success) throw new Error(result.error);
      await refreshBalance();
      const explorer = result.transactionHash ? await getBlockExplorerUrl(result.transactionHash, collectible.chain_id) : null;
      toast({ title: 'Funds withdrawn', description: explorer ? `Transaction: ${explorer}` : 'The lock balance has been sent.' });
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
          <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>Price ({collectible.currency})</Label><Input type="number" min="0" step="any" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>Total supply</Label><Input type="number" min="1" step="1" value={form.max_supply} onChange={(e) => setForm((f) => ({ ...f, max_supply: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>Per-person limit</Label><Input type="number" min="1" max={form.max_supply} step="1" value={form.max_keys_per_address} onChange={(e) => setForm((f) => ({ ...f, max_keys_per_address: Number(e.target.value) }))} /></div>
          </div>
          <div className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><Label>Physical item available</Label><p className="text-sm text-muted-foreground">Describe how a collector can arrange fulfillment.</p></div><Switch checked={form.is_claimable} onCheckedChange={(is_claimable) => setForm((f) => ({ ...f, is_claimable }))} /></div>{form.is_claimable && <Textarea className="mt-3" rows={3} value={form.fulfillment_note} onChange={(e) => setForm((f) => ({ ...f, fulfillment_note: e.target.value }))} />}</div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-4"><div><div className="font-semibold">Creator funds</div><p className="text-sm text-muted-foreground">Purchases remain in the Unlock lock until a lock manager withdraws them.</p></div><Button size="icon" variant="ghost" onClick={refreshBalance}><RefreshCw className="h-4 w-4" /></Button></div>
            <div className="mt-4 text-2xl font-bold">{balance ? `${balance.formatted} ${collectible.currency}` : '—'}</div>
            <div className="mt-4 space-y-2"><Label>Withdraw to</Label><Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder={defaultBeneficiary || '0x…'} /><p className="text-xs text-muted-foreground">Defaults to your connected TeeRex wallet. Replace it with any valid address you control if needed.</p></div>
            <Button className="mt-4" variant="outline" disabled={withdrawing || !balance || balance.raw <= 0n} onClick={withdraw}>{withdrawing ? 'Withdrawing…' : 'Withdraw available balance'}</Button>
          </div>
          <div className="text-xs text-muted-foreground">Network and payment token cannot be changed after publishing in V1. <a className="inline-flex items-center hover:underline" href="#" onClick={(e) => e.preventDefault()}>On-chain settings are signed by your wallet <ExternalLink className="ml-1 h-3 w-3" /></a></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button disabled={saving || !changed} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
