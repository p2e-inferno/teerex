import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { useQueryClient } from '@tanstack/react-query';
import { getExplorerTxUrl } from '@/lib/config/network-config';
import { PassDeliveryDetails } from '@/components/ticket-pass/PassDeliveryToast';
import { TransactionStepList, type TransactionStep, type TransactionStepStatus } from '@/components/ticket-pass/TransactionStepList';

type Phase = 'processing' | 'success' | 'failed' | 'review' | 'refund_pending' | 'refunded';

interface TicketPassProcessingDialogProps {
  reference: string | null;
  isOpen: boolean;
  onClose: () => void;
  chainId?: number | null;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;
const INITIAL_STEPS: TransactionStep[] = [
  { id: 'payment', label: 'Confirm payment', status: 'executing' },
  { id: 'delivery', label: 'Deliver pass value', status: 'idle' },
  { id: 'finalize', label: 'Update pass order', status: 'idle' },
];

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function isFatalConfirmError(message: string) {
  return (
    message.startsWith('issuance_lock_failed:') ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('amount_mismatch') ||
    message.includes('currency_mismatch') ||
    message.includes('wallet_reference_mismatch') ||
    message.includes('pass_reference_mismatch')
  );
}

export const TicketPassProcessingDialog: React.FC<TicketPassProcessingDialogProps> = ({ reference, isOpen, onClose, chainId }) => {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('processing');
  const [message, setMessage] = useState('Confirming your payment…');
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txChainId, setTxChainId] = useState<number | null>(chainId ?? null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [steps, setSteps] = useState<TransactionStep[]>(INITIAL_STEPS);
  const startedRef = useRef<string | null>(null);

  const setStepStatus = useCallback((id: string, status: TransactionStepStatus, error?: string) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, status, error } : step)));
  }, []);

  const setAllSteps = useCallback((status: TransactionStepStatus) => {
    setSteps((current) => current.map((step) => ({ ...step, status, error: undefined })));
  }, []);

  const resetProcessingState = useCallback(() => {
    setPhase('processing');
    setMessage('Confirming your payment…');
    setTokenId(null);
    setTxHash(null);
    setTxChainId(chainId ?? null);
    setExplorerUrl(null);
    setSteps(INITIAL_STEPS);
  }, [chainId]);

  const finishSuccess = useCallback((tid: string | null, hash?: string | null, resultChainId?: number | null) => {
    setPhase('success');
    setTokenId(tid);
    setTxHash(hash ?? null);
    setTxChainId(resultChainId ?? chainId ?? null);
    setMessage('Your pass value has been delivered to your wallet.');
    setAllSteps('success');
    queryClient.invalidateQueries({ queryKey: ['my-ticket-pass-orders'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-pass-onchain'] });
    queryClient.invalidateQueries({ queryKey: ['native-balance'] });
    queryClient.invalidateQueries({ queryKey: ['erc20-balance'] });
  }, [chainId, queryClient, setAllSteps]);

  const finishReview = useCallback(() => {
    setPhase('review');
    setMessage("We hit a snag delivering your pass and are reviewing it. Your payment is safe — we'll complete delivery or refund you in full. No action is needed.");
    setStepStatus('delivery', 'error', 'Delivery requires review.');
    queryClient.invalidateQueries({ queryKey: ['my-ticket-pass-orders'] });
  }, [queryClient, setStepStatus]);

  const finishRefunded = useCallback(() => {
    setPhase('refunded');
    setMessage("We couldn't deliver this pass, so your payment has been refunded in full. It should reach your account within a few business days.");
    setStepStatus('delivery', 'error', 'Delivery could not be completed.');
    queryClient.invalidateQueries({ queryKey: ['my-ticket-pass-orders'] });
  }, [queryClient, setStepStatus]);

  const finishRefundPending = useCallback(() => {
    setPhase('refund_pending');
    setMessage("We couldn't deliver this pass, so we've started your refund. We'll update the status when Paystack confirms it.");
    setStepStatus('delivery', 'error', 'Delivery could not be completed.');
    queryClient.invalidateQueries({ queryKey: ['my-ticket-pass-orders'] });
  }, [queryClient, setStepStatus]);

  const handleConfirmResult = useCallback((result: any) => {
    if (result?.tokenId || result?.already_issued || result?.txHash) {
      finishSuccess(result.tokenId ?? null, result.txHash ?? null, result.chain_id ?? null);
      return true;
    }
    if (result?.refunded) {
      finishRefunded();
      return true;
    }
    if (result?.refund_pending) {
      finishRefundPending();
      return true;
    }
    if (result?.needs_review) {
      finishReview();
      return true;
    }
    return false;
  }, [finishSuccess, finishReview, finishRefunded, finishRefundPending]);

  const run = useCallback(async () => {
    if (!reference) return;
    const token = await getAccessToken?.();
    let lastConfirmError: string | null = null;

    // 1. Kick off verification + atomic fulfilment.
    try {
      setStepStatus('payment', 'executing');
      setStepStatus('delivery', 'idle');
      setStepStatus('finalize', 'idle');
      setMessage('Verifying your Paystack payment…');
      const result = await callEdgeFunction<any>('confirm-ticket-pass-paystack', { reference }, { privyToken: token });
      if (handleConfirmResult(result)) return;
    } catch (err) {
      lastConfirmError = getErrorMessage(err, 'Payment confirmation failed.');
      console.warn('[ticket-pass-processing] confirm error, polling status', err);
      if (isFatalConfirmError(lastConfirmError)) {
        setPhase('failed');
        setStepStatus('payment', 'error', lastConfirmError);
        setMessage(lastConfirmError);
        return;
      }
      setMessage('Waiting for Paystack confirmation…');
    }

    // 2. Poll status until terminal.
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const status = await callEdgeFunction<any>('get-ticket-pass-order-status', { reference }, { privyToken: token });
        if (status?.status === 'DISPENSED') {
          finishSuccess(status.token_id ?? null, status.txn_hash ?? null, status.chain_id ?? null);
          return;
        }
        if (status?.status === 'REFUNDED') {
          finishRefunded();
          return;
        }
        if (status?.status === 'REFUND_PENDING') {
          finishRefundPending();
          return;
        }
        if (status?.status === 'REFUND_NEEDS_ATTENTION' || status?.status === 'REFUND_FAILED') {
          setPhase('review');
          setStepStatus('delivery', 'error', 'Refund requires review.');
          setMessage("We're reviewing your refund with Paystack. No action is needed from you.");
          return;
        }
        if (status?.status === 'NEEDS_REVIEW') {
          finishReview();
          return;
        }
        if (status?.status === 'FAILED') {
          setPhase('failed');
          setStepStatus('delivery', 'error', status.last_error || 'Delivery failed.');
          setMessage(status.last_error || 'Delivery failed. You can retry below.');
          return;
        }
        if (status?.status === 'PENDING') {
          setStepStatus('payment', 'executing');
          setStepStatus('delivery', 'idle');
          setStepStatus('finalize', 'idle');
          setMessage('Waiting for Paystack confirmation…');
        }
        if (status?.status === 'PAID') {
          setStepStatus('payment', 'success');
          setStepStatus('delivery', 'executing');
          setStepStatus('finalize', 'idle');
          setMessage('Payment confirmed. Delivering your pass…');
          try {
            const result = await callEdgeFunction<any>('confirm-ticket-pass-paystack', { reference }, { privyToken: token });
            if (handleConfirmResult(result)) return;
          } catch (err) {
            lastConfirmError = getErrorMessage(err, 'Payment confirmation failed.');
            if (isFatalConfirmError(lastConfirmError)) {
              setPhase('failed');
              setStepStatus('delivery', 'error', lastConfirmError);
              setMessage(lastConfirmError);
              return;
            }
          }
        }
      } catch {
        // transient — keep polling
      }
    }
    setPhase('failed');
    setStepStatus('delivery', 'error', lastConfirmError || 'Still processing.');
    setMessage(lastConfirmError || 'Still processing. You can retry, or check "My Passes" shortly.');
  }, [reference, getAccessToken, setStepStatus, handleConfirmResult, finishSuccess, finishReview, finishRefunded, finishRefundPending]);

  const retry = useCallback(async () => {
    if (!reference) return;
    resetProcessingState();
    setMessage('Retrying delivery…');
    setStepStatus('payment', 'success');
    setStepStatus('delivery', 'executing');
    const token = await getAccessToken?.();
    try {
      // confirm re-verifies the payment AND fulfils — idempotent and recovers PENDING/PAID/FAILED.
      const result = await callEdgeFunction<any>('confirm-ticket-pass-paystack', { reference }, { privyToken: token });
      if (handleConfirmResult(result)) return;
    } catch (err) {
      setPhase('failed');
      setStepStatus('delivery', 'error', err instanceof Error ? err.message : 'Retry failed.');
      setMessage(err instanceof Error ? err.message : 'Retry failed.');
      return;
    }
    await run();
  }, [reference, getAccessToken, handleConfirmResult, resetProcessingState, run, setStepStatus]);

  useEffect(() => {
    if (!isOpen || !reference) return;
    if (startedRef.current === reference) return;
    startedRef.current = reference;
    resetProcessingState();
    void run();
  }, [isOpen, reference, resetProcessingState, run]);

  useEffect(() => {
    let cancelled = false;
    setExplorerUrl(null);
    if (!txHash || !txChainId) return undefined;

    void getExplorerTxUrl(txChainId, txHash).then((url) => {
      if (!cancelled && /^https?:\/\//i.test(url)) {
        setExplorerUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [txHash, txChainId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && phase !== 'processing') onClose(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === 'processing' && <Loader2 className="w-5 h-5 animate-spin" />}
            {phase === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            {(phase === 'failed' || phase === 'review' || phase === 'refund_pending' || phase === 'refunded') && <AlertCircle className="w-5 h-5 text-amber-600" />}
            {phase === 'success' ? 'Pass delivered' : phase === 'refunded' ? 'Refunded' : phase === 'refund_pending' ? 'Refund started' : phase === 'review' ? 'Under review' : phase === 'failed' ? 'Action needed' : 'Processing'}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        {phase === 'processing' && (
          <div className="rounded-md border bg-slate-50 p-4">
            <TransactionStepList steps={steps} />
          </div>
        )}

        {phase === 'success' && (
          <div className="space-y-3 py-1">
            {tokenId && (
              <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-900">
                Pass token #{tokenId}
              </div>
            )}
            <PassDeliveryDetails
              txHash={txHash}
              explorerUrl={explorerUrl}
              profileHref={txChainId ? `/profile?chainId=${txChainId}` : '/profile'}
              showMessage={false}
            />
          </div>
        )}

        <DialogFooter className="w-full flex-col gap-2 sm:flex-col sm:space-x-0">
          {phase === 'failed' && <Button variant="outline" className="w-full" onClick={retry}>Retry</Button>}
          {phase !== 'processing' && <Button className="w-full" onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
