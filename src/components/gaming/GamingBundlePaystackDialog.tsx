import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { usePaystackPayment } from 'react-paystack';
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
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CreditCard } from 'lucide-react';
import type { GamingBundle } from '@/types/gaming';

interface PaymentData {
  reference: string;
  email: string;
  walletAddress: string;
  bundleId: string;
  amount: number;
}

interface GamingBundlePaystackDialogProps {
  bundle: GamingBundle | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentData: PaymentData) => void;
}

export const GamingBundlePaystackDialog: React.FC<GamingBundlePaystackDialogProps> = ({
  bundle,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentHandled, setPaymentHandled] = useState(false);
  const [userEmail, setUserEmail] = useState(user?.email?.address || '');
  const [userWalletAddress, setUserWalletAddress] = useState(wallets[0]?.address || '');
  const [subaccountCode, setSubaccountCode] = useState<string | null>(null);
  const [reference, setReference] = useState<string>('');
  const [shouldLaunchPaystack, setShouldLaunchPaystack] = useState(false);

  const paystackPublicKey = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
  const fiatEnabled = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_ENABLE_FIAT;
    if (raw === undefined || raw === null || raw === '') return false;
    return String(raw).toLowerCase() === 'true';
  }, []);

  useEffect(() => {
    if (isOpen) return;
    // Parent closed the dialog; reset transient state so reopening works reliably.
    setIsLoading(false);
    setShouldLaunchPaystack(false);
    setPaymentHandled(false);
    setSubaccountCode(null);
    setReference('');
  }, [isOpen]);

  const config = {
    reference: reference || `TeeRex-Bundle-${bundle?.id}-${Date.now()}`,
    email: userEmail,
    amount: Math.round((bundle?.price_fiat || 0) * 100),
    publicKey: paystackPublicKey || '',
    currency: bundle?.fiat_symbol || 'NGN',
    ...(subaccountCode && { subaccount: subaccountCode }),
    metadata: {
      bundle_id: bundle?.id || '',
      bundle_address: bundle?.bundle_address || '',
      chain_id: bundle?.chain_id ?? undefined,
      custom_fields: [
        {
          display_name: 'Wallet Address',
          variable_name: 'user_wallet_address',
          value: userWalletAddress,
        },
        {
          display_name: 'Bundle ID',
          variable_name: 'bundle_id',
          value: bundle?.id || '',
        },
        {
          display_name: 'User Email',
          variable_name: 'user_email',
          value: userEmail,
        },
      ],
    },
  };

  const initializePayment = usePaystackPayment(config);

  const ensureTransactionRecord = async (paymentReference: string): Promise<string | null> => {
    if (!bundle) return null;
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const accessToken = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('init-gaming-bundle-transaction', {
        body: {
          bundle_id: bundle.id,
          reference: paymentReference,
          email: userEmail,
          wallet_address: userWalletAddress,
          amount: config.amount,
        },
        headers: {
          ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
          ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
        },
      });

      if (error) {
        throw new Error(error?.message || 'Failed to create bundle order');
      }

      if (data && !data.ok) {
        throw new Error(data?.error || 'Failed to create bundle order');
      }

      return data?.subaccount_code || null;
    } catch (e: any) {
      throw new Error(e?.message || 'Failed to create bundle order');
    }
  };

  const handlePaymentSuccess = useCallback((reference: { reference: string }) => {
    if (!bundle) return;
    setPaymentHandled(true);

    const paymentData: PaymentData = {
      reference: reference.reference,
      email: userEmail,
      walletAddress: userWalletAddress,
      bundleId: bundle.id,
      amount: bundle.price_fiat || 0,
    };

    onSuccess(paymentData);
    setIsLoading(false);
  }, [bundle, userEmail, userWalletAddress, onSuccess]);

  const handlePaymentClose = useCallback(() => {
    setIsLoading(false);
    if (paymentHandled) return;
    toast({
      title: 'Payment Window Closed',
      description: 'If you completed payment, your bundle will be issued shortly.',
    });
  }, [paymentHandled, toast]);

  useEffect(() => {
    if (!shouldLaunchPaystack) return;
    initializePayment({
      onSuccess: handlePaymentSuccess,
      onClose: handlePaymentClose,
    });
    setShouldLaunchPaystack(false);
    // At this point we've handed off to the Paystack modal, so stop blocking UI and close our dialog.
    setIsLoading(false);
    onClose();
  }, [shouldLaunchPaystack, initializePayment, handlePaymentClose, handlePaymentSuccess, onClose]);

  const handlePayment = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    setPaymentHandled(false);

    if (!fiatEnabled) {
      toast({
        title: 'Fiat payments disabled',
        description: 'Card/Bank payments are currently disabled.',
        variant: 'destructive',
      });
      return;
    }

    if (!userEmail.trim()) {
      toast({
        title: 'Email Required',
        description: 'Please enter your email address to proceed.',
        variant: 'destructive',
      });
      return;
    }

    if (!userWalletAddress.trim()) {
      toast({
        title: 'Wallet Address Required',
        description: 'Please enter your wallet address to receive the NFT ticket.',
        variant: 'destructive',
      });
      return;
    }

    if (!paystackPublicKey) {
      toast({
        title: 'Payment Configuration Error',
        description: 'Paystack public key is not configured.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    const paymentReference = `TeeRex-Bundle-${bundle?.id}-${Date.now()}`;
    setReference(paymentReference);

    try {
      const vendorSubaccount = await ensureTransactionRecord(paymentReference);
      if (vendorSubaccount) setSubaccountCode(vendorSubaccount);
    } catch (err) {
      setIsLoading(false);
      toast({
        title: 'Could not start checkout',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      return;
    }
    setShouldLaunchPaystack(true);
  };

  if (!bundle) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Paystack Checkout
          </DialogTitle>
          <DialogDescription>
            Pay in Naira and receive your gaming bundle NFT ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bundle</span>
            <span className="font-medium">{bundle.title}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">NGN {Number(bundle.price_fiat || 0).toLocaleString()}</span>
          </div>

          <div className="space-y-2 pt-2">
            <Label htmlFor="bundle-email">Email Address *</Label>
            <Input
              type="email"
              id="bundle-email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bundle-wallet">Wallet Address *</Label>
            <Input
              type="text"
              id="bundle-wallet"
              value={userWalletAddress}
              onChange={(e) => setUserWalletAddress(e.target.value)}
              placeholder="0x..."
              required
              disabled={isLoading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handlePayment} disabled={isLoading || !fiatEnabled} className="w-32">
            {isLoading ? <Loader2 className="animate-spin" /> : 'Pay Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
