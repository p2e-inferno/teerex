import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import type { GamingBundle } from '@/types/gaming';

interface PaymentData {
  reference: string;
  email: string;
  walletAddress: string;
  bundleId: string;
  amount: number;
}

interface GamingBundleProcessingDialogProps {
  bundle: GamingBundle | null;
  isOpen: boolean;
  onClose: () => void;
  paymentData: PaymentData | null;
  onPurchaseSuccess?: () => void;
}

type ProcessingStatus = 'processing' | 'success' | 'error' | 'timeout';

export const GamingBundleProcessingDialog: React.FC<GamingBundleProcessingDialogProps> = ({
  bundle,
  isOpen,
  onClose,
  paymentData,
  onPurchaseSuccess,
}) => {
  const { toast } = useToast();
  const { getAccessToken } = usePrivy();
  const [status, setStatus] = useState<ProcessingStatus>('processing');
  const [progressMessage, setProgressMessage] = useState('Processing your payment...');
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const hasCalledSuccessRef = useRef(false);
  const monitorSessionRef = useRef(0);
  const pollTimeoutRef = useRef<number | null>(null);
  const hasTriggeredConfirmRef = useRef(false);

  useEffect(() => {
    if (paymentData) {
      monitorSessionRef.current += 1;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      setStatus('processing');
      setProgressMessage('Processing your payment...');
      setTransactionHash(null);
      hasCalledSuccessRef.current = false;
      hasTriggeredConfirmRef.current = false;
      startMonitoring(monitorSessionRef.current);
    }
  }, [paymentData?.reference]);

  const startMonitoring = (sessionId: number) => {
    if (!paymentData) return;
    setProgressMessage('Payment recorded. Issuing your bundle NFT...');
    if (!hasTriggeredConfirmRef.current) {
      hasTriggeredConfirmRef.current = true;
      (async () => {
        const token = await getAccessToken?.();
        return supabase.functions.invoke('confirm-gaming-bundle-paystack', {
          body: { reference: paymentData.reference },
          headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
        });
      })()
        .then(({ data, error }) => {
          if (error) throw error;
          if (data?.ok === false) throw new Error(data?.error || 'Unable to confirm Paystack payment');
        })
        .catch((err) => {
          console.warn('[BUNDLE MONITOR] confirm-gaming-bundle-paystack failed:', err);
          toast({
            title: 'Payment confirmation delayed',
            description:
              err instanceof Error ? err.message : 'We could not confirm your Paystack payment yet. We will keep checking.',
            variant: 'destructive',
          });
        });
    }
    monitorStatus(sessionId);
  };

  const monitorStatus = (sessionId: number) => {
    if (!paymentData) return;
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 2000;

    const poll = async () => {
      if (monitorSessionRef.current !== sessionId) return;
      attempts++;
      try {
        const { data, error } = await supabase.functions.invoke('get-gaming-bundle-order-status', {
          body: { reference: paymentData.reference },
        });

        if (error || !data?.found) {
          if (attempts < maxAttempts) {
            pollTimeoutRef.current = window.setTimeout(poll, pollInterval);
            return;
          }
          setStatus('timeout');
          return setProgressMessage(
            'Processing is taking longer than expected. Please check back later.'
          );
        }

        if (data.fulfillment_method === 'NFT' && (data.txn_hash || data.key_granted)) {
          setTransactionHash(data.txn_hash || null);
          setStatus('success');
          setProgressMessage('Your bundle NFT has been issued successfully!');
          toast({
            title: 'Bundle Issued!',
            description: `Your NFT ticket has been sent to ${paymentData.walletAddress}`,
          });
          if (!hasCalledSuccessRef.current) {
            hasCalledSuccessRef.current = true;
            onPurchaseSuccess?.();
          }
          return;
        }

        if (data.fulfillment_method !== 'NFT' && data.eas_uid) {
          setStatus('success');
          setProgressMessage('Your bundle attestation has been issued successfully!');
          toast({
            title: 'Bundle Issued!',
            description: `Your bundle has been issued to ${paymentData.walletAddress}`,
          });
          if (!hasCalledSuccessRef.current) {
            hasCalledSuccessRef.current = true;
            onPurchaseSuccess?.();
          }
          return;
        }

        if (data.status === 'PAID') {
          setProgressMessage('Payment confirmed. Issuing your bundle NFT...');
        }

        if (attempts < maxAttempts) {
          pollTimeoutRef.current = window.setTimeout(poll, pollInterval);
          return;
        }
        setStatus('timeout');
        return setProgressMessage(
          'Processing is taking longer than expected. Please check back later.'
        );
      } catch (err) {
        console.error('[BUNDLE MONITOR] Error checking status:', err);
        if (attempts < maxAttempts) {
          pollTimeoutRef.current = window.setTimeout(poll, pollInterval);
          return;
        }
        setStatus('error');
        return setProgressMessage('An error occurred while processing your bundle.');
      }
    };

    pollTimeoutRef.current = window.setTimeout(poll, 3000);
  };

  if (!bundle || !paymentData) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
            {status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
            {status === 'timeout' && <AlertCircle className="w-5 h-5 text-yellow-600" />}
            <span>
              {status === 'success' && 'Bundle Issued Successfully!'}
              {status === 'error' && 'Processing Error'}
              {status === 'processing' && 'Processing Your Bundle'}
              {status === 'timeout' && 'Processing Delayed'}
            </span>
          </DialogTitle>
          <DialogDescription>
            {status === 'success' && `Your NFT bundle for ${bundle.title} has been issued.`}
            {status === 'error' && 'There was an error processing your bundle.'}
            {status === 'processing' && `Issuing your NFT bundle for ${bundle.title}...`}
            {status === 'timeout' && 'Your bundle is still being processed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bundle</span>
              <span className="font-medium">{bundle.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount Paid</span>
              <span className="font-medium">NGN {paymentData.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wallet Address</span>
              <span className="font-mono text-muted-foreground">
                {paymentData.walletAddress.slice(0, 6)}...{paymentData.walletAddress.slice(-4)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {status === 'processing' && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
            {status === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
            {status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
            {status === 'timeout' && <AlertCircle className="w-5 h-5 text-yellow-600" />}
            <div className="flex-1">
              <p className="text-sm font-medium">{progressMessage}</p>
              {transactionHash && (
                <p className="text-xs text-muted-foreground mt-1">Tx: {transactionHash}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>
            {status === 'processing' ? 'Hide' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
