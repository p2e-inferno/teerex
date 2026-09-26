import { useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUserAddresses } from '@/hooks/useUserAddresses';
import { useCollectibleChainState } from '@/hooks/useCollectibleChainState';
import { purchaseLockKeys } from '@/utils/publicLockActions';
import type { Collectible } from '@/types/collectible';

interface Props {
  collectible: Collectible | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchased?: () => void;
}

export function CollectiblePurchaseDialog({ collectible, open, onOpenChange, onPurchased }: Props) {
  const { authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const addresses = useUserAddresses();
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const chain = useCollectibleChainState(collectible?.lock_address, collectible?.chain_id, addresses);

  const remaining = useMemo(() => {
    if (!collectible) return 0;
    return Math.max(0, Math.min(
      collectible.max_supply - chain.sold,
      chain.maxPerWallet - chain.owned,
    ));
  }, [chain.maxPerWallet, chain.owned, chain.sold, collectible]);

  useEffect(() => { if (open) setQuantity(1); }, [open, collectible?.id]);
  useEffect(() => { if (quantity > remaining && remaining > 0) setQuantity(remaining); }, [quantity, remaining]);

  if (!collectible) return null;
  const total = collectible.price * quantity;
  const preferred = user?.wallet?.address?.toLowerCase();
  const wallet = wallets.find((candidate) => candidate.address.toLowerCase() === preferred) ?? wallets[0];

  const purchase = async () => {
    if (!authenticated) { login(); return; }
    if (!wallet) {
      toast({ title: 'Connect a wallet first', variant: 'destructive' });
      return;
    }
    if (quantity < 1 || quantity > remaining) return;
    setBuying(true);
    try {
      const result = await purchaseLockKeys(
        collectible.lock_address,
        collectible.price,
        collectible.currency,
        wallet,
        collectible.chain_id,
        quantity,
      );
      if (!result.success) throw new Error(result.error || 'Purchase failed.');
      await chain.refresh();
      toast({
        title: quantity > 1 ? `You collected ${quantity} editions` : 'Collectible purchased',
        description: result.transactionHash ? 'Your NFT ownership is now recorded on-chain.' : undefined,
      });
      onPurchased?.();
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Purchase failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setBuying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collect {collectible.name}</DialogTitle>
          <DialogDescription>Purchase directly from the creator’s Unlock contract.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <img src={collectible.image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <div>
              <div className="font-medium">{collectible.price} {collectible.currency} each</div>
              <div className="text-sm text-muted-foreground">{Math.max(0, collectible.max_supply - chain.sold)} remaining · you can buy {remaining} more</div>
            </div>
          </div>
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
          <Button disabled={buying || chain.loading || remaining < 1} onClick={purchase}>
            {remaining < 1 ? 'Unavailable' : buying ? 'Confirming…' : authenticated ? `Buy ${quantity > 1 ? quantity : ''}`.trim() : 'Connect to buy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
