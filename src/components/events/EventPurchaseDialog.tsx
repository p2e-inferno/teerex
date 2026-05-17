
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
import { purchaseKey, getBlockExplorerUrl, isFreeOnchain } from '@/utils/lockUtils';
import { Loader2, ExternalLink, MessageSquareText } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { isEventRegistrationClosed } from '@/lib/events/registration';
import { useGaslessFallback } from '@/hooks/useGasless';
import { normalizeEmail } from '@/utils/emailUtils';
import { isFreeEvent } from '@/lib/events/paymentMethods';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import { isEmptyHtml } from '@/utils/textUtils';
import { PurchaseFormFields } from '@/components/events/PurchaseFormFields';
import {
  isPurchaseFormSchemaEmpty,
  PurchaseFormResponseValues,
  PurchaseFormSchema,
  validatePurchaseFormResponse,
} from '@/types/purchaseForm';

interface EventPurchaseDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onPurchaseSuccess?: (opts?: { increment?: boolean }) => void;
}

export const EventPurchaseDialog: React.FC<EventPurchaseDialogProps> = ({
  event,
  isOpen,
  onClose,
  onPurchaseSuccess,
}) => {
  const { wallets } = useWallets();
  const { getAccessToken, user } = usePrivy();
  const { toast } = useToast();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [email, setEmail] = useState('');
  const [isOnchainFree, setIsOnchainFree] = useState(false);
  const [purchaseSuccessMessage, setPurchaseSuccessMessage] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [formSchema, setFormSchema] = useState<PurchaseFormSchema | null>(null);
  const [formValues, setFormValues] = useState<PurchaseFormResponseValues>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Reset success state whenever the dialog opens for a new attempt.
  useEffect(() => {
    if (isOpen) {
      setPurchaseSuccess(false);
      setPurchaseSuccessMessage(null);
      setFormErrors({});
    }
  }, [isOpen]);

  // Load the event's purchase form schema (if any).
  useEffect(() => {
    if (!event?.id) {
      setFormSchema(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('event_purchase_form_schemas')
        .select('schema_json')
        .eq('event_id', event.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setFormSchema(null);
        return;
      }
      setFormSchema((data?.schema_json as PurchaseFormSchema | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [event?.id]);

  // Check if event is free on-chain (catches bug-affected events)
  useEffect(() => {
    const checkOnchainStatus = async () => {
      if (!event?.lock_address || !event?.chain_id) {
        setIsOnchainFree(false);
        return;
      }
      const isFree = await isFreeOnchain(event.lock_address, event.chain_id);
      setIsOnchainFree(isFree);
    };
    checkOnchainStatus();
  }, [event?.lock_address, event?.chain_id]);

  // Load email from previous tickets (prefill if user has bought before)
  useEffect(() => {
    const loadEmail = async () => {
      const address = (wallets[0]?.address ?? user?.wallet?.address)?.toLowerCase();
      if (!address) return;

      // Use secure RPC function that only returns user's own email
      const { data, error } = await supabase
        .rpc('get_my_ticket_email', {
          p_owner_wallet: address
        });

      if (!error && data) {
        setEmail(data);
      }
    };
    loadEmail();
  }, [wallets, user?.wallet?.address]);

  type GaslessPurchaseArgs = {
    event_id: string;
    lock_address: string;
    chain_id: number;
    recipient: string;
    user_email: string;
    purchase_form_response?: PurchaseFormResponseValues | null;
  };

  // Use shared hook for gasless FREE purchase (with auto-fallback)
  // Enabled if marked as free in DB OR detected as free on-chain (catches bug-affected events)
  const purchaseFreeTicketWithGasless = useGaslessFallback<GaslessPurchaseArgs, any>(
    'gasless-purchase',
    async (args) => await handleClientSidePurchase(args.user_email, args.purchase_form_response ?? null, { currency: 'FREE', price: 0 }),
    isFreeEvent(event) || isOnchainFree
  );

  // Client-side purchase handler (ALL currencies: FREE, ETH, USDC)
  const handleClientSidePurchase = async (
    userEmail: string,
    purchaseFormResponse: PurchaseFormResponseValues | null,
    override?: { currency: string; price: number }
  ) => {
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
      const currency = override?.currency ?? event.currency;
      const price = override?.price ?? event.price;

      // Purchase ticket on-chain
      const result = await purchaseKey(
        event.lock_address,
        price,
        currency,
        wallet,
        event.chain_id
      );

      if (result.success && result.transactionHash) {
        // Register ticket via edge function (service_role bypasses RLS)
        const accessToken = await getAccessToken?.();
        let registerData: any = null;
        try {
          registerData = await callEdgeFunction('register-ticket', {
            event_id: event.id,
            owner_wallet: wallet.address.toLowerCase(),
            grant_tx_hash: result.transactionHash,
            user_email: userEmail || null,
            purchase_form_response: purchaseFormResponse,
          }, { privyToken: accessToken });
        } catch (err) {
          console.error('Failed to register ticket:', err);
          // Don't fail the purchase - ticket is already on-chain
        }

        const snapshotMessage =
          (registerData as any)?.purchase_confirmation_message_snapshot ?? null;

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
        onPurchaseSuccess?.({ increment: true });

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
            console.warn('[TICKET EMAIL] Failed to send ticket email:', err instanceof Error ? err.message : String(err));
          }
        })();

        if (snapshotMessage && !isEmptyHtml(snapshotMessage)) {
          setPurchaseSuccessMessage(snapshotMessage);
          setPurchaseSuccess(true);
          return { success: true };
        }

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
    const walletAddress = (wallets[0]?.address ?? user?.wallet?.address)?.toLowerCase();

    if (!normalizedEmail) {
      toast({
        title: 'Email required',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    // Validate any creator-defined purchase form fields.
    let cleanedFormValues: PurchaseFormResponseValues | null = null;
    if (!isPurchaseFormSchemaEmpty(formSchema)) {
      const { errors, values } = validatePurchaseFormResponse(formSchema, formValues);
      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        toast({
          title: 'Please fix the highlighted fields',
          description: Object.values(errors)[0],
          variant: 'destructive',
        });
        return;
      }
      setFormErrors({});
      cleanedFormValues = values;
    }

    if (!event) {
      toast({
        title: 'Event unavailable',
        description: 'Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }

    // Double check registration cutoff
    if (isEventRegistrationClosed(event)) {
      toast({
        title: 'Registration Closed',
        description: 'Ticket sales have ended for this event.',
        variant: 'destructive',
      });
      onClose();
      return;
    }

    // Check allow list if event has one
    if (event.has_allow_list && walletAddress) {
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

    // FREE tickets: hook is enabled if marked as free in DB OR detected as free on-chain
    const isEffectivelyFree = isFreeEvent(event) || isOnchainFree;

    if (isEffectivelyFree) {
      if (!walletAddress) {
        toast({
          title: 'Wallet not connected',
          description: 'Please connect your wallet to claim this ticket.',
          variant: 'destructive',
        });
        return;
      }

      setIsPurchasing(true);
      try {
        const gaslessArgs: GaslessPurchaseArgs = {
          event_id: event.id,
          lock_address: event.lock_address,
          chain_id: event.chain_id,
          recipient: walletAddress,
          user_email: normalizedEmail,
          purchase_form_response: cleanedFormValues,
        };

        const result: any = await purchaseFreeTicketWithGasless(gaslessArgs);

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
            onPurchaseSuccess?.({ increment: false });
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
          onPurchaseSuccess?.({ increment: true });

          const snapshotMessage =
            result.purchase_confirmation_message_snapshot ?? null;
          if (snapshotMessage && !isEmptyHtml(snapshotMessage)) {
            setPurchaseSuccessMessage(snapshotMessage);
            setPurchaseSuccess(true);
          } else {
            onClose();
          }
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
    await handleClientSidePurchase(normalizedEmail, cleanedFormValues);
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
      'invalid_purchase_form_response': 'One of your answers didn\'t pass validation. Please review and try again.',
    };
    return errorMessages[errorCode] || errorCode;
  };

  if (!event) return null;

  if (purchaseSuccess && purchaseSuccessMessage) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>You're In! 🎟️</DialogTitle>
            <DialogDescription>
              Your ticket for {event.title} has been issued.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
              <MessageSquareText className="w-4 h-4" />
              Message from the organiser
            </div>
            <div className="rounded-md border border-purple-100 bg-purple-50/60 p-3 max-h-[40vh] overflow-y-auto">
              <RichTextDisplay
                content={purchaseSuccessMessage}
                className="prose prose-sm max-w-none leading-relaxed"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We've also included this in your ticket confirmation email.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={onClose} className="w-full sm:w-auto">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Get Ticket for {event.title}</DialogTitle>
          <DialogDescription>
            Confirm your purchase for a ticket to this event.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 overflow-y-auto flex-grow px-1">
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
              {isFreeEvent(event) ? 'Free' : `${event.price} ${event.currency}`}
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

          {/* Creator-defined extra purchase fields */}
          <PurchaseFormFields
            schema={formSchema}
            values={formValues}
            errors={formErrors}
            onChange={setFormValues}
            disabled={isPurchasing}
            prefillWallet={(wallets[0]?.address ?? user?.wallet?.address) ?? null}
          />
        </div>
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isPurchasing}>
            Cancel
          </Button>
          <Button onClick={handlePurchase} disabled={isPurchasing || !email} className="w-32">
            {isPurchasing ? (
              <Loader2 className="animate-spin" />
            ) : isFreeEvent(event) ? (
              'Claim Ticket'
            ) : (
              'Purchase'
            )}
            {/* On-chain free check happens during handlePurchase */}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
