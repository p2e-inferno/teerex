
import React, { useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PublishedEvent } from '@/utils/eventUtils';
import { purchaseKey, getBlockExplorerUrl } from '@/utils/lockUtils';
import { Loader2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface EventPurchaseDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EventPurchaseDialog: React.FC<EventPurchaseDialogProps> = ({ event, isOpen, onClose }) => {
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isPurchasing, setIsPurchasing] = useState(false);

  const handlePurchase = async () => {
    if (!event) return;
    
    const wallet = wallets[0];
    if (!wallet) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet to purchase a ticket.',
        variant: 'destructive',
      });
      return;
    }

    setIsPurchasing(true);
    try {
      const result = await purchaseKey(event.lock_address, event.price, event.currency, wallet);

      if (result.success && result.transactionHash) {
        const explorerUrl = getBlockExplorerUrl(result.transactionHash, 'baseSepolia');
        toast({
          title: 'Purchase Successful!',
          description: (
            <div>
              <p>You've successfully purchased a ticket for {event.title}.</p>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline mt-2"
              >
                View Transaction <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ),
        });
        onClose();
      } else {
        throw new Error(result.error || 'Failed to purchase ticket.');
      }
    } catch (error) {
      toast({
        title: 'Purchase Failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Get Ticket for {event.title}</DialogTitle>
          <DialogDescription>
            Confirm your purchase for a ticket to this event.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Event</span>
            <span className="font-semibold">{event.title}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Date</span>
            <span className="font-semibold">
              {event.date ? format(event.date, "MMM d, yyyy") : 'TBD'} at {event.time}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Location</span>
            <span className="font-semibold">{event.location}</span>
          </div>
          <div className="flex justify-between items-center text-lg">
            <span className="text-muted-foreground">Price</span>
            <span className="font-bold text-primary">
              {event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}`}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPurchasing}>
            Cancel
          </Button>
          <Button onClick={handlePurchase} disabled={isPurchasing} className="w-32">
            {isPurchasing ? (
              <Loader2 className="animate-spin" />
            ) : event.currency === 'FREE' ? (
              'Register for Free'
            ) : (
              'Confirm Purchase'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
