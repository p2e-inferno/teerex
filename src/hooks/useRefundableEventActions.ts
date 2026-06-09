import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { PublishedEvent } from '@/types/event';
import type { RefundableEventStatusSnapshot } from '@/hooks/useRefundableEventStatus';
import { shouldAutoReleaseAfterRefund, RELEASE_AFTER_REFUND_PROMPT } from '@/lib/events/refundStatus';
import {
  cancelAndRefundProtectedEvent,
  releaseProtectedEventManager,
} from '@/utils/lockUtils';

const isAlreadyReleasedError = (message?: string) =>
  Boolean(message && /alreadyreleased/i.test(message.replace(/\s+/g, '')));

export const useRefundableEventActions = (
  event: PublishedEvent | null,
  wallet: any,
  authorizedRefundAddress?: string | null,
  refreshStatus?: (txHash?: string) => Promise<RefundableEventStatusSnapshot | null>,
  creatorAddress?: string | null
) => {
  const { toast } = useToast();
  const [isReleasing, setIsReleasing] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);

  const signerIsCreator = Boolean(
    wallet?.address &&
    creatorAddress &&
    wallet.address.toLowerCase() === creatorAddress.toLowerCase()
  );

  const releaseEvent = useCallback(async (): Promise<boolean> => {
    if (!event?.lock_address || !event.refund_controller_address) return false;

    setIsReleasing(true);
    const result = await releaseProtectedEventManager(
      event.lock_address,
      event.refund_controller_address,
      wallet,
      event.chain_id
    );
    setIsReleasing(false);

    if (!result.success) {
      // Treat an already-released lock as success — the desired end state is reached.
      if (isAlreadyReleasedError(result.error)) {
        await refreshStatus?.();
        return true;
      }
      toast({
        title: 'Release failed',
        description: result.error,
        variant: 'destructive',
      });
      return false;
    }

    toast({ title: 'Event released', description: 'You now manage this lock.' });
    await refreshStatus?.(result.transactionHash);
    return true;
  }, [event?.chain_id, event?.lock_address, event?.refund_controller_address, refreshStatus, toast, wallet]);

  const cancelAndRefund = useCallback(async (batchSize = 50): Promise<RefundableEventStatusSnapshot | null> => {
    if (!event?.lock_address || !event.refund_controller_address) return null;

    if (!wallet?.address) {
      toast({
        title: 'Refund failed',
        description: 'Connect the authorized wallet to continue refunds.',
        variant: 'destructive',
      });
      return null;
    }

    if (
      authorizedRefundAddress &&
      wallet.address.toLowerCase() !== authorizedRefundAddress.toLowerCase()
    ) {
      toast({
        title: 'Wrong wallet connected',
        description: 'Switch to the authorized wallet to continue refunds.',
        variant: 'destructive',
      });
      return null;
    }

    setIsRefunding(true);
    const result = await cancelAndRefundProtectedEvent(
      event.lock_address,
      event.refund_controller_address,
      wallet,
      event.chain_id,
      batchSize
    );
    setIsRefunding(false);

    if (!result.success) {
      toast({
        title: 'Refund failed',
        description: result.error,
        variant: 'destructive',
      });
      return null;
    }

    toast({ title: 'Refund transaction confirmed' });
    return (await refreshStatus?.(result.transactionHash)) ?? null;
  }, [authorizedRefundAddress, event?.chain_id, event?.lock_address, event?.refund_controller_address, refreshStatus, toast, wallet]);

  // Run cancel+refund, then chain a release ONLY when this batch completed the refunds
  // and the connected wallet is the on-chain creator (the only address allowed to release).
  // Partial batches, attendee callers, or a rejected 2nd prompt fall back to the standalone CTA.
  const cancelAndRefundThenMaybeRelease = useCallback(async (batchSize = 50) => {
    const snapshot = await cancelAndRefund(batchSize);
    if (shouldAutoReleaseAfterRefund(snapshot, signerIsCreator)) {
      toast(RELEASE_AFTER_REFUND_PROMPT);
      await releaseEvent();
    }
  }, [cancelAndRefund, releaseEvent, signerIsCreator, toast]);

  return {
    isReleasing,
    isRefunding,
    signerIsCreator,
    releaseEvent,
    cancelAndRefund,
    cancelAndRefundThenMaybeRelease,
  };
};
