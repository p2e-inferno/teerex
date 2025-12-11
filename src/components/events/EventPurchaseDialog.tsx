
import React, { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
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
import type { PublishedEvent } from '@/types/event';
import { purchaseKey, getBlockExplorerUrl } from '@/utils/lockUtils';
import { Loader2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useGaslessFallback } from '@/hooks/useGasless';
import { toast as sonnerToast } from 'sonner';
import { normalizeEmail } from '@/utils/emailUtils';

interface EventPurchaseDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EventPurchaseDialog: React.FC<EventPurchaseDialogProps> = ({ event, isOpen, onClose }) => {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
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

        const explorerUrl = await getBlockExplorerUrl(result.transactionHash, event.chain_id);
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

        // Fire-and-forget ticket email via Edge Function
        void (async () => {
          try {
            const accessToken = await getAccessToken?.();
            await supabase.functions.invoke('send-ticket-email', {
              body: {
                event_id: event.id,
                user_email: userEmail,
                wallet_address: wallet.address.toLowerCase(),
                txn_hash: result.transactionHash,
                chain_id: event.chain_id,
              },
              headers: accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : undefined,
            });
          } catch (err) {
            console.warn('[TICKET EMAIL] Failed to send ticket email:', err?.message || err);
          }
        })();
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
    const normalizedEmail = normalizeEmail(email);
    const walletAddress = wallets[0]?.address?.toLowerCase();

    if (!normalizedEmail) {
      toast({
        title: 'Email required',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    // Check allow list if event has one
    if (event?.has_allow_list && walletAddress) {
      const { data: allowListEntry, error } = await supabase
        .from('event_allow_list')
        .select('id')
        .eq('event_id', event.id)
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (error) {
        console.error('Error checking allow list:', error);
        toast({
          title: 'Error',
          description: 'Failed to verify allow list access',
          variant: 'destructive',
        });
        return;
      }

      if (!allowListEntry) {
        try {
          const { error: requestError } = await supabase
            .from('event_allow_list_requests')
            .insert({
              event_id: event.id,
              user_email: normalizedEmail,
              wallet_address: walletAddress,
            });

          if (requestError) {
            console.error('Error requesting allow list approval:', requestError);
            if (requestError.code === '23505') {
              toast({
                title: 'Request already sent',
                description:
                  'You have already requested approval for this wallet address. Please wait for the organizer to review.',
              });
            } else {
              toast({
                title: 'Request failed',
                description: 'Failed to request approval for this private event.',
                variant: 'destructive',
              });
            }
          } else {
            toast({
              title: 'Approval requested',
              description:
                'This is a private event. You are not on the allow list yet. Your request has been sent to the organizer for review.',
            });
          }
        } catch (err) {
          console.error('Unexpected error requesting allow list approval:', err);
          toast({
            title: 'Request failed',
            description: 'Failed to request approval for this private event.',
            variant: 'destructive',
          });
        }

        // Do not proceed with purchase until approved
        return;
      }
    }

    // FREE tickets: try gasless first, fallback to client-side
    if (event?.currency === 'FREE') {
      setIsPurchasing(true);
      try {
        const gaslessArgs = {
          event_id: event.id,
          lock_address: event.lock_address,
          chain_id: event.chain_id,
          recipient: wallets[0]?.address?.toLowerCase(),
          user_email: normalizedEmail,
        };
        const result: any = await purchaseFreeTicketWithGasless(gaslessArgs, normalizedEmail);

        if (result.ok) {
          // Check if already claimed (idempotent response)
          if (result.already_claimed) {
            const explorerUrl = result.purchase_tx_hash
              ? await getBlockExplorerUrl(result.purchase_tx_hash, event.chain_id)
              : null;

            toast({
              title: result.recovered ? 'Ticket Recovered! ✅' : 'Already Claimed',
              description: (
                <div>
                  <p>
                    {result.recovered
                      ? 'Your ticket record has been recovered. You already own this ticket on-chain.'
                      : 'You have already claimed a ticket for this event.'}
                  </p>
                  {explorerUrl && (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline mt-2">
                      View Transaction <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ),
            });
            onClose();
            return;
          }

          // Normal gasless purchase succeeded
          const explorerUrl = result.purchase_tx_hash
            ? await getBlockExplorerUrl(result.purchase_tx_hash, event.chain_id)
            : null;

          toast({
            title: 'Ticket Claimed! ✨',
            description: (
              <div>
                <p>Your free ticket has been issued. Gas sponsored by TeeRex!</p>
                {explorerUrl && (
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline mt-2">
                    View Transaction <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {result.limits?.remaining_today !== undefined && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {result.limits.remaining_today} gasless tickets remaining today
                  </p>
                )}
                {result.db_sync_status === 'partial' && (
                  <p className="text-xs text-yellow-600 mt-2">
                    ⚠️ Ticket minted successfully, but some records may sync later.
                  </p>
                )}
              </div>
            ),
          });
          onClose();
        } else if (result.error) {
          // Gasless returned an error before fallback
          toast({
            title: 'Gasless Purchase Failed',
            description: getErrorMessage(result.error),
            variant: 'destructive',
          });
        }
        // If result.success is false but no result.ok, fallback was already called
      } finally {
        setIsPurchasing(false);
      }
      return;
    }

    // ETH/USDC tickets: client-side purchase with email storage
    await handleClientSidePurchase(normalizedEmail);
  };

  // Helper to convert error codes to user-friendly messages
  const getErrorMessage = (errorCode: string): string => {
    const errorMessages: Record<string, string> = {
      'recipient_wallet_not_authorized': 'Your wallet is not authorized for this action.',
      'invalid_email_format': 'Please provide a valid email address.',
      'chain_not_supported': 'This blockchain network is not supported.',
      'network_not_fully_configured': 'Network configuration is incomplete.',
      'event_not_found': 'Event not found.',
      'only_free_tickets_supported': 'Only free tickets can use gasless purchase.',
      'lock_address_mismatch': 'Event configuration mismatch.',
      'chain_id_mismatch': 'Chain ID mismatch.',
      'limit_exceeded': 'Daily gasless limit exceeded. Please use your wallet instead.',
      'max_keys_reached': 'You have reached the maximum number of tickets allowed for this event.',
      'ticket_already_claimed': 'You have already claimed a ticket for this event.',
    };
    return errorMessages[errorCode] || errorCode;
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
