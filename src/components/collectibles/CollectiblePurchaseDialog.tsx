import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { ExternalLink, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import { useToast } from '@/hooks/use-toast';
import { recordCollectiblePurchase } from '@/lib/collectibles/collectibleApi';
import { useCollectibleChainState } from '@/hooks/useCollectibleChainState';
import { useActiveSigningWallet } from '@/hooks/useActiveSigningWallet';
import { getCollectiblePurchaseAllowance, isCollectibleQuantityAllowed } from '@/lib/collectibles/purchaseLimits';
import { getBlockExplorerUrl } from '@/utils/lockUtils';
import { purchaseLockKeys } from '@/utils/publicLockActions';
import type { Collectible } from '@/types/collectible';

interface Props {
  collectible: Collectible | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchased?: () => void;
}

export function CollectiblePurchaseDialog({ collectible, open, onOpenChange, onPurchased }: Props) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const wallet = useActiveSigningWallet();
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [success, setSuccess] = useState<{ quantity: number; explorerUrl: string | null } | null>(null);
  const purchasingAddress = wallet?.address ? [wallet.address.toLowerCase()] : [];
  const chain = useCollectibleChainState(collectible?.lock_address, collectible?.chain_id, purchasingAddress);

  const remaining = useMemo(() => {
    if (!collectible || !chain.ready || chain.error) return 0;
    return getCollectiblePurchaseAllowance({
      maxSupply: collectible.max_supply,
      sold: chain.sold,
      maxPerWallet: chain.maxPerWallet,
      ownedByPurchasingWallet: chain.owned,
    });
  }, [chain.error, chain.maxPerWallet, chain.owned, chain.ready, chain.sold, collectible]);

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setSuccess(null);
    }
  }, [open, collectible?.id]);

  useEffect(() => {
    if (remaining === 0) return;
    if (quantity > remaining) setQuantity(remaining);
  }, [quantity, remaining]);

  if (!collectible) return null;
  const total = collectible.price * quantity;

  const purchase = async () => {
    if (!authenticated) { login(); return; }
    if (!wallet) {
      toast({ title: 'Connect a wallet first', variant: 'destructive' });
      return;
    }
    if (!chain.ready || chain.error) {
      toast({ title: 'Availability is not ready', description: 'Refresh the on-chain availability before purchasing.', variant: 'destructive' });
      return;
    }
    if (!isCollectibleQuantityAllowed(quantity, remaining)) {
      toast({ title: 'Quantity is no longer available', description: 'Refresh availability and choose a valid quantity.', variant: 'destructive' });
      return;
    }
    setBuying(true);
    try {
      const purchasedQuantity = quantity;
      const result = await purchaseLockKeys(
        collectible.lock_address,
        collectible.price,
        collectible.currency,
        wallet,
        collectible.chain_id,
        purchasedQuantity,
      );
      if (!result.success) throw new Error(result.error || 'Purchase failed.');
      if (result.transactionHash) {
        const txHash = result.transactionHash;
        void getAccessToken()
          .then((token) => (token ? recordCollectiblePurchase(collectible.id, txHash, token) : undefined))
          .catch((error) => console.warn('Collectible purchase notification failed:', error));
      }
      await chain.refresh();
      const explorerUrl = result.transactionHash
        ? await getBlockExplorerUrl(result.transactionHash, collectible.chain_id)
        : null;
      setSuccess({ quantity: purchasedQuantity, explorerUrl });
      onPurchased?.();
    } catch (error) {
      toast({ title: 'Purchase failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setBuying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle>{success.quantity > 1 ? `${success.quantity} editions collected` : 'Collectible purchased'}</DialogTitle>
              <DialogDescription>Your Unlock NFT {success.quantity > 1 ? 'keys are' : 'key is'} now in your wallet.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg border p-4">
                <img src={collectible.image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <div><div className="font-semibold">{collectible.name}</div><div className="text-sm text-muted-foreground">Owned in this purchase: {success.quantity}</div></div>
              </div>
              {collectible.is_claimable && collectible.fulfillment_note && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="font-medium">Physical item available</div>
                  <RichTextDisplay content={collectible.fulfillment_note} className="mt-1 text-sm text-muted-foreground" />
                </div>
              )}
              {success.explorerUrl && (
                <a className="inline-flex items-center text-sm font-medium text-primary hover:underline" href={success.explorerUrl} target="_blank" rel="noreferrer">
                  View transaction <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button asChild><Link to="/my-collection" onClick={() => onOpenChange(false)}>View My Collection</Link></Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Collect {collectible.name}</DialogTitle>
              <DialogDescription>Purchase directly from the creator’s Unlock contract.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <img src={collectible.image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <div>
                  <div className="font-medium">{collectible.price} {collectible.currency} each</div>
                  <div className="text-sm text-muted-foreground">{chain.ready ? `${Math.max(0, collectible.max_supply - chain.sold)} remaining · this wallet can buy ${remaining} more` : 'Checking live availability…'}</div>
                </div>
              </div>
              {collectible.is_claimable && collectible.fulfillment_note && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="font-medium">Physical item terms</div>
                  <RichTextDisplay content={collectible.fulfillment_note} className="mt-1 text-sm text-muted-foreground" />
                </div>
              )}
              {chain.error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div>Could not load live purchase limits from the collectible contract.</div>
                  <Button type="button" className="mt-2" size="sm" variant="outline" onClick={() => { void chain.refresh(); }}>Retry availability</Button>
                </div>
              )}
              {chain.maxPerWallet > 1 && remaining > 0 && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Quantity</span>
                  <div className="flex items-center gap-3">
                    <Button type="button" size="icon" variant="outline" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
                    <span className="w-6 text-center font-semibold">{quantity}</span>
                    <Button type="button" size="icon" variant="outline" disabled={quantity >= remaining} onClick={() => setQuantity((q) => Math.min(remaining, q + 1))}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
              <div className="flex justify-between border-t pt-4 font-semibold">
                <span>Total</span><span>{total} {collectible.currency}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={buying || chain.loading || !chain.ready || Boolean(chain.error) || remaining < 1} onClick={purchase}>
                {!chain.ready ? 'Checking…' : chain.error ? 'Unavailable' : remaining < 1 ? 'Unavailable' : buying ? 'Confirming…' : authenticated ? `Buy ${quantity > 1 ? quantity : ''}`.trim() : 'Connect to buy'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
