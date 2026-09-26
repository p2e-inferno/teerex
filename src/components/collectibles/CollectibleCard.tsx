import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IdentityName } from '@/components/identity/IdentityName';
import type { Collectible } from '@/types/collectible';
import { useCollectibleChainState } from '@/hooks/useCollectibleChainState';
import { useToast } from '@/hooks/use-toast';

interface Props {
  collectible: Collectible;
  ownedQuantity?: number;
  showShare?: boolean;
  footer?: ReactNode;
}

export function CollectibleCard({ collectible, ownedQuantity, showShare = false, footer }: Props) {
  const { sold } = useCollectibleChainState(collectible.lock_address, collectible.chain_id);
  const { toast } = useToast();
  const soldOut = sold >= collectible.max_supply;
  const copy = async () => {
    const url = `${window.location.origin}/collectible/${collectible.id}`;
    await navigator.clipboard.writeText(url);
    toast({ title: 'Collectible link copied' });
  };

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <Link to={`/collectible/${collectible.id}`} className="block bg-muted">
        <img src={collectible.image_url} alt={collectible.name} className="aspect-square w-full object-cover" />
      </Link>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          {soldOut && <Badge variant="secondary">Sold out</Badge>}
          {collectible.is_claimable && <Badge variant="outline"><PackageCheck className="mr-1 h-3 w-3" />Physical item available</Badge>}
          {ownedQuantity !== undefined && ownedQuantity > 0 && <Badge>Owned: {ownedQuantity}</Badge>}
        </div>
        <div>
          <Link to={`/collectible/${collectible.id}`} className="text-lg font-semibold hover:underline">{collectible.name}</Link>
          <div className="mt-1 text-sm text-muted-foreground">
            by <IdentityName address={collectible.creator_address} displayName={collectible.creator_display_name} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-3 text-sm">
          <div>
            <div className="font-medium">{collectible.price} {collectible.currency}</div>
            <div className="text-muted-foreground">{Math.min(sold, collectible.max_supply)}/{collectible.max_supply} collected</div>
          </div>
          {showShare && (
            <Button type="button" variant="ghost" size="icon" onClick={copy} aria-label="Share collectible">
              <Share2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}
