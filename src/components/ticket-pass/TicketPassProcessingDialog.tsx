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

type Phase = 'processing' | 'success' | 'failed';

interface TicketPassProcessingDialogProps {
  reference: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

export const TicketPassProcessingDialog: React.FC<TicketPassProcessingDialogProps> = ({ reference, isOpen, onClose }) => {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('processing');
  const [message, setMessage] = useState('Confirming your payment…');
  const [tokenId, setTokenId] = useState<string | null>(null);
  const startedRef = useRef<string | null>(null);

  const finishSuccess = useCallback((tid: string | null) => {
    setPhase('success');
    setTokenId(tid);
    setMessage('Your pass value has been delivered to your wallet.');
    queryClient.invalidateQueries({ queryKey: ['my-ticket-pass-orders'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-pass-onchain'] });
  }, [queryClient]);

  const run = useCallback(async () => {
    if (!reference) return;
    const token = await getAccessToken?.();

    // 1. Kick off verification + atomic fulfilment.
    try {
      setMessage('Verifying payment and delivering your pass…');
      const result = await callEdgeFunction<any>('confirm-ticket-pass-paystack', { reference }, { privyToken: token });
      if (result?.tokenId || result?.already_issued) {
        finishSuccess(result.tokenId ?? null);
        return;
      }
    } catch (err) {
      // Fall through to polling — issuance may be in progress under the lock.
      console.warn('[ticket-pass-processing] confirm error, polling status', err);
    }

    // 2. Poll status until terminal.
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const status = await callEdgeFunction<any>('get-ticket-pass-order-status', { reference }, { privyToken: token });
        if (status?.status === 'DISPENSED') {
          finishSuccess(status.token_id ?? null);
          return;
        }
        if (status?.status === 'FAILED') {
          setPhase('failed');
          setMessage(status.last_error || 'Delivery failed. You can retry below.');
          return;
        }
      } catch {
        // transient — keep polling
      }
    }
    setPhase('failed');
    setMessage('Still processing. You can retry, or check "My Passes" shortly.');
  }, [reference, getAccessToken, finishSuccess]);

  const retry = useCallback(async () => {
    if (!reference) return;
    setPhase('processing');
    setMessage('Retrying delivery…');
    const token = await getAccessToken?.();
    try {
      // confirm re-verifies the payment AND fulfils — idempotent and recovers PENDING/PAID/FAILED.
      const result = await callEdgeFunction<any>('confirm-ticket-pass-paystack', { reference }, { privyToken: token });
      if (result?.tokenId || result?.already_issued) {
        finishSuccess(result.tokenId ?? null);
        return;
      }
    } catch (err) {
      setPhase('failed');
      setMessage(err instanceof Error ? err.message : 'Retry failed.');
      return;
    }
    await run();
  }, [reference, getAccessToken, finishSuccess, run]);

  useEffect(() => {
    if (!isOpen || !reference) return;
    if (startedRef.current === reference) return;
    startedRef.current = reference;
    setPhase('processing');
    setTokenId(null);
    void run();
  }, [isOpen, reference, run]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && phase !== 'processing') onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === 'processing' && <Loader2 className="w-5 h-5 animate-spin" />}
            {phase === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            {phase === 'failed' && <AlertCircle className="w-5 h-5 text-amber-600" />}
            {phase === 'success' ? 'Pass delivered' : phase === 'failed' ? 'Action needed' : 'Processing'}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        {phase === 'success' && tokenId && (
          <p className="text-sm text-muted-foreground py-2">Pass token #{tokenId}</p>
        )}

        <DialogFooter>
          {phase === 'failed' && <Button variant="outline" onClick={retry}>Retry</Button>}
          {phase !== 'processing' && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
