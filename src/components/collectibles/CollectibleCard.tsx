import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageModal } from '@/components/ui/image-modal';
import { IdentityName } from '@/components/identity/IdentityName';
import { CollectiblePurchaseDialog } from '@/components/collectibles/CollectiblePurchaseDialog';
import type { Collectible } from '@/types/collectible';
import { useCollectibleChainState } from '@/hooks/useCollectibleChainState';
import { ShareButton } from '@/components/interactions/ShareButton';
import { collectibleShareUrl } from '@/lib/shareUrls';
import { getCollectCta } from '@/lib/collectibles/purchaseLimits';

interface Props {
  collectible: Collectible;
  ownedQuantity?: number;
  showShare?: boolean;
  showCollect?: boolean;
  expandableImage?: boolean;
  footer?: ReactNode;
}

export function CollectibleCard({ collectible, ownedQuantity, showShare = false, showCollect = false, expandableImage = false, footer }: Props) {
  const chain = useCollectibleChainState(collectible.lock_address, collectible.chain_id);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const soldOut = chain.ready && chain.sold >= collectible.max_supply;
  const cta = getCollectCta({ ...chain, maxSupply: collectible.max_supply });

  const image = (
    <img
      src={collectible.image_url}
      alt={collectible.name}
      className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
    />
  );

  return (
    <Card className="group overflow-hidden border-0 shadow-sm transition-all duration-200 hover:shadow-md">
      {expandableImage ? (
        <ImageModal src={collectible.image_url} alt={collectible.name}>
          <button type="button" className="block w-full cursor-zoom-in overflow-hidden bg-muted" aria-label={`View ${collectible.name} full size`}>
            {image}
          </button>
        </ImageModal>
      ) : (
        <Link to={`/collectible/${collectible.id}`} className="block overflow-hidden bg-muted">
          {image}
        </Link>
      )}
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
            <div className="text-muted-foreground">{chain.ready ? `${Math.min(chain.sold, collectible.max_supply)}/${collectible.max_supply} collected` : chain.error ? 'Availability unavailable' : 'Checking availability…'}</div>
          </div>
          {showShare && (
            <ShareButton
              url={collectibleShareUrl(collectible.id)}
              title={collectible.name}
              copiedMessage="Collectible link copied to clipboard"
              variant="ghost"
              size="icon"
            />
          )}
        </div>
        {showCollect && (
          <Button className="w-full" disabled={cta.disabled} onClick={() => setPurchaseOpen(true)}>{cta.label}</Button>
        )}
        {footer}
      </CardContent>
      {showCollect && (
        <CollectiblePurchaseDialog collectible={collectible} open={purchaseOpen} onOpenChange={setPurchaseOpen} onPurchased={() => { void chain.refresh(); }} />
      )}
    </Card>
  );
}
