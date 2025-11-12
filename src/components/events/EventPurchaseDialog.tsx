
import React, { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PublishedEvent } from '@/utils/eventUtils';
import { purchaseKey, getBlockExplorerUrl } from '@/utils/lockUtils';
import { Loader2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useGaslessFallback } from '@/hooks/useGasless';
import { toast as sonnerToast } from 'sonner';

interface EventPurchaseDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EventPurchaseDialog: React.FC<EventPurchaseDialogProps> = ({ event, isOpen, onClose }) => {
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [email, setEmail] = useState('');

  // Load email from previous tickets (prefill if user has bought before)
  useEffect(() => {
    const loadEmail = async () => {
      if (!wallets[0]?.address) return;

      // Use secure RPC function that only returns user's own email
      const { data, error } = await supabase
        .rpc('get_my_ticket_email', {
          p_owner_wallet: wallets[0].address.toLowerCase()
        });

      if (!error && data) {
        setEmail(data);
      }
    };
    loadEmail();
  }, [wallets]);

  // Use shared hook for gasless FREE purchase (with auto-fallback)
  const purchaseFreeTicketWithGasless = useGaslessFallback(
    'gasless-purchase',
    async (userEmail: string) => {
      // Fallback: client-side purchase flow with email storage
      return await handleClientSidePurchase(userEmail);
    },
    event?.currency === 'FREE'
  );

  // Client-side purchase handler (ALL currencies: FREE, ETH, USDC)
  const handleClientSidePurchase = async (userEmail: string) => {
    if (!event) return { success: false };

    const wallet = wallets[0];
    if (!wallet) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet to purchase a ticket.',
        variant: 'destructive',
      });
      return { success: false };
    }

    setIsPurchasing(true);
    try {
      // Purchase ticket on-chain
      const result = await purchaseKey(
        event.lock_address,
        event.price,
        event.currency,
        wallet,
        event.chain_id
      );

      if (result.success && result.transactionHash) {
        // Store ticket record with email in database
        const { error: insertError } = await supabase.from('tickets').insert({
          event_id: event.id,
          owner_wallet: wallet.address.toLowerCase(),
          grant_tx_hash: result.transactionHash,
          status: 'active',
          user_email: userEmail || null,
        });

        if (insertError) {
          console.error('Failed to store ticket record:', insertError);
          // Don't fail the purchase - ticket is already on-chain
        }

        const explorerUrl = getBlockExplorerUrl(result.transactionHash, event.chain_id);
        toast({
          title: 'Purchase Successful!',
          description: (
            <div>
              <p>You've successfully purchased a ticket for {event.title}.</p>
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline mt-2">
                View Transaction <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ),
        });
        onClose();
        return { success: true };
      } else {
        throw new Error(result.error || 'Failed to purchase ticket.');
      }
    } catch (error) {
      toast({
        title: 'Purchase Failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
      return { success: false };
    } finally {
      setIsPurchasing(false);
    }
  };

  // Unified purchase handler for ALL currencies
  const handlePurchase = async () => {
    // Validate email before purchase
    if (!email || !email.includes('@')) {
      toast({
        title: 'Email required',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    // FREE tickets: try gasless first, fallback to client-side
    if (event?.currency === 'FREE') {
      const result: any = await purchaseFreeTicketWithGasless({
        event_id: event.id,
        lock_address: event.lock_address,
        chain_id: event.chain_id,
        recipient: wallets[0]?.address?.toLowerCase(),
        user_email: email,
      }, email);

      if (result.ok) {
        sonnerToast.success('Ticket claimed! Gas sponsored by TeeRex ✨');
        toast({
          title: 'Ticket Claimed!',
          description: 'Your free ticket has been issued. Gas sponsored by TeeRex!',
        });
        onClose();
      }
      // If gasless failed, handleClientSidePurchase was already called as fallback
      return;
    }

    // ETH/USDC tickets: client-side purchase with email storage
    await handleClientSidePurchase(email);
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

          {/* Email input field */}
          <div className="space-y-2 pt-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={isPurchasing}
            />
            <p className="text-xs text-muted-foreground">
              We'll use this to send you event updates and your ticket invoice
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPurchasing}>
            Cancel
          </Button>
          <Button onClick={handlePurchase} disabled={isPurchasing || !email} className="w-32">
            {isPurchasing ? (
              <Loader2 className="animate-spin" />
            ) : event.currency === 'FREE' ? (
              'Claim Ticket'
            ) : (
              'Purchase'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
