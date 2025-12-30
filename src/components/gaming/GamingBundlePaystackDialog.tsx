import React, { useState } from 'react';
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
  const [isPaystackOpen, setIsPaystackOpen] = useState(false);
  const [userEmail, setUserEmail] = useState(user?.email?.address || '');
  const [userWalletAddress, setUserWalletAddress] = useState(wallets[0]?.address || '');
  const [subaccountCode, setSubaccountCode] = useState<string | null>(null);

  const paystackPublicKey = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;

  const config = {
    reference: `TeeRex-Bundle-${bundle?.id}-${Date.now()}`,
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

  const ensureTransactionRecord = async (): Promise<string | null> => {
    if (!bundle) return null;
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const accessToken = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('init-gaming-bundle-transaction', {
        body: {
          bundle_id: bundle.id,
          reference: config.reference,
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
        console.warn('[PAYSTACK INIT] Failed to create bundle transaction', error?.message);
        return null;
      }

      if (data && !data.ok) {
        console.warn('[PAYSTACK INIT] Failed to create bundle transaction', data?.error);
        return null;
      }

      return data?.subaccount_code || null;
    } catch (e: any) {
      console.warn('[PAYSTACK INIT] Error ensuring bundle transaction', e?.message || e);
      return null;
    }
  };

  const handlePaymentSuccess = (reference: { reference: string }) => {
    if (!bundle) return;
    setPaymentHandled(true);
    setIsPaystackOpen(false);

    const paymentData: PaymentData = {
      reference: reference.reference,
      email: userEmail,
      walletAddress: userWalletAddress,
      bundleId: bundle.id,
      amount: bundle.price_fiat || 0,
    };

    onSuccess(paymentData);
    setIsLoading(false);
  };

  const handlePaymentClose = () => {
    setIsLoading(false);
    setIsPaystackOpen(false);
    if (paymentHandled) return;
    toast({
      title: 'Payment Window Closed',
      description: 'If you completed payment, your bundle will be issued shortly.',
    });
  };

  const handlePayment = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    setPaymentHandled(false);
    setIsPaystackOpen(true);

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

    const dialogElement = document.querySelector('[role="none"]');
    if (dialogElement) {
      (dialogElement as HTMLElement).style.display = 'none';
    }

    setIsLoading(true);
    const vendorSubaccount = await ensureTransactionRecord();
    if (vendorSubaccount) {
      setSubaccountCode(vendorSubaccount);
    }
    initializePayment({
      onSuccess: handlePaymentSuccess,
      onClose: handlePaymentClose,
    });
  };

  if (!bundle) return null;

  return (
    <Dialog
      open={isOpen && !isPaystackOpen}
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
          <Button onClick={handlePayment} disabled={isLoading} className="w-32">
            {isLoading ? <Loader2 className="animate-spin" /> : 'Pay Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
