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
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { Loader2, CreditCard } from 'lucide-react';
import type { TicketPass } from '@/types/ticketPass';
import { formatFiatPrice, formatNetworkName, formatPassValidity, formatPayoutSummary } from '@/lib/ticketPass/display';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { getFiatCheckoutConfig } from '@/lib/payments/fiatCheckout';

export interface TicketPassPaymentData {
  reference: string;
  email: string;
  walletAddress: string;
  passId: string;
}

interface TicketPassPaystackDialogProps {
  pass: TicketPass | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: TicketPassPaymentData) => void;
}

export const TicketPassPaystackDialog: React.FC<TicketPassPaystackDialogProps> = ({
  pass,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const { networks } = useNetworkConfigs();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentHandled, setPaymentHandled] = useState(false);
  const [userEmail, setUserEmail] = useState(user?.email?.address || '');
  const [userWalletAddress, setUserWalletAddress] = useState(wallets[0]?.address || '');
  const [subaccountCode, setSubaccountCode] = useState<string | null>(null);
  const [reference, setReference] = useState<string>('');
  const [shouldLaunchPaystack, setShouldLaunchPaystack] = useState(false);
  const [amountKobo, setAmountKobo] = useState<number | null>(null);

  const fiatCheckout = useMemo(() => getFiatCheckoutConfig(), []);
  const paystackPublicKey = fiatCheckout.publicKey;
  const fiatEnabled = fiatCheckout.enabled;

  useEffect(() => {
    if (isOpen) return;
    setIsLoading(false);
    setShouldLaunchPaystack(false);
    setPaymentHandled(false);
    setSubaccountCode(null);
    setReference('');
    setAmountKobo(null);
  }, [isOpen]);

  const config = {
    reference: reference || `TeeRex-Pass-${pass?.id}-${Date.now()}`,
    email: userEmail,
    amount: amountKobo ?? 0,
    publicKey: paystackPublicKey || '',
    currency: pass?.fiat_symbol || 'NGN',
    ...(subaccountCode && { subaccount: subaccountCode }),
    metadata: {
      pass_id: pass?.id || '',
      chain_id: pass?.chain_id ?? undefined,
      custom_fields: [
        { display_name: 'Wallet Address', variable_name: 'user_wallet_address', value: userWalletAddress },
        { display_name: 'Pass ID', variable_name: 'pass_id', value: pass?.id || '' },
        { display_name: 'User Email', variable_name: 'user_email', value: userEmail },
      ],
    },
  };

  const initializePayment = usePaystackPayment(config);

  const ensureTransactionRecord = async (paymentReference: string): Promise<{ subaccountCode: string | null; amountKobo: number }> => {
    if (!pass) throw new Error('Missing pass');
    const accessToken = await getAccessToken?.();
    const data = await callEdgeFunction<any>('init-ticket-pass-transaction', {
      pass_id: pass.id,
      reference: paymentReference,
      email: userEmail,
      wallet_address: userWalletAddress,
      ...(typeof pass.price_fiat_kobo === 'number' || typeof amountKobo === 'number'
        ? { amount: amountKobo ?? pass.price_fiat_kobo }
        : {}),
    }, { privyToken: accessToken, withAnonKey: true });

    if (typeof data?.amount_kobo !== 'number' || Number.isNaN(data.amount_kobo)) {
      throw new Error('Missing amount from server');
    }
    return { subaccountCode: data?.subaccount_code || null, amountKobo: data.amount_kobo };
  };

  const handlePaymentSuccess = useCallback((ref: { reference: string }) => {
    if (!pass) return;
    setPaymentHandled(true);
    onSuccess({ reference: ref.reference, email: userEmail, walletAddress: userWalletAddress, passId: pass.id });
    setIsLoading(false);
  }, [pass, userEmail, userWalletAddress, onSuccess]);

  const handlePaymentClose = useCallback(() => {
    setIsLoading(false);
    if (paymentHandled) return;
    toast({ title: 'Payment window closed', description: 'If you completed payment, your pass will be delivered shortly.' });
  }, [paymentHandled, toast]);

  useEffect(() => {
    if (!shouldLaunchPaystack) return;
    if (typeof amountKobo !== 'number' || Number.isNaN(amountKobo) || amountKobo <= 0) {
      setShouldLaunchPaystack(false);
      setIsLoading(false);
      toast({ title: 'Could not start checkout', description: 'Missing amount from server', variant: 'destructive' });
      return;
    }
    initializePayment({ onSuccess: handlePaymentSuccess, onClose: handlePaymentClose });
    setShouldLaunchPaystack(false);
    setIsLoading(false);
    onClose();
  }, [shouldLaunchPaystack, amountKobo, initializePayment, handlePaymentClose, handlePaymentSuccess, onClose, toast]);

  const handlePayment = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    setPaymentHandled(false);

    if (!fiatEnabled) {
      toast({ title: 'Fiat payments disabled', description: 'Card/Bank payments are currently disabled.', variant: 'destructive' });
      return;
    }
    if (!userEmail.trim()) {
      toast({ title: 'Email required', description: 'Enter your email to proceed.', variant: 'destructive' });
      return;
    }
    if (!userWalletAddress.trim()) {
      toast({ title: 'Wallet address required', description: 'Enter the wallet that will receive the pass value.', variant: 'destructive' });
      return;
    }
    if (!paystackPublicKey) {
      toast({ title: 'Payment configuration error', description: 'Paystack public key is not configured.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    const paymentReference = `TeeRex-Pass-${pass?.id}-${Date.now()}`;
    setReference(paymentReference);

    try {
      const init = await ensureTransactionRecord(paymentReference);
      setAmountKobo(init.amountKobo);
      if (init.subaccountCode) setSubaccountCode(init.subaccountCode);
    } catch (err) {
      setIsLoading(false);
      toast({ title: 'Could not start checkout', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      return;
    }
    setShouldLaunchPaystack(true);
  };

  if (!pass) return null;
  const network = networks.find((n) => n.chain_id === pass.chain_id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Paystack Checkout
          </DialogTitle>
          <DialogDescription>Pay in Naira and receive your pass value on-chain.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pass</span>
            <span className="font-medium">{pass.title}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">You receive</span>
            <span className="font-medium">{formatPayoutSummary(pass)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">{formatFiatPrice(pass)}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Network</span>
            <span className="font-medium text-right">{formatNetworkName(pass.chain_id, network?.chain_name)}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Pass validity</span>
            <span className="font-medium text-right">{formatPassValidity(pass)}</span>
          </div>

          <div className="space-y-2 pt-2">
            <Label htmlFor="pass-email">Email Address *</Label>
            <Input type="email" id="pass-email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="your@email.com" required disabled={isLoading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pass-wallet">Wallet Address *</Label>
            <Input type="text" id="pass-wallet" value={userWalletAddress} onChange={(e) => setUserWalletAddress(e.target.value)} placeholder="0x..." required disabled={isLoading} />
          </div>
        </div>

        <DialogFooter className="gap-3 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handlePayment} disabled={isLoading || !fiatCheckout.available} className="w-full sm:w-32">
            {isLoading ? <Loader2 className="animate-spin" /> : 'Pay Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
