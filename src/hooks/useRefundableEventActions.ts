import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { PublishedEvent } from '@/types/event';
import {
  cancelAndRefundProtectedEvent,
  releaseProtectedEventManager,
} from '@/utils/lockUtils';

export const useRefundableEventActions = (
  event: PublishedEvent | null,
  wallet: any,
  authorizedRefundAddress?: string | null,
  refreshStatus?: (txHash?: string) => Promise<void>
) => {
  const { toast } = useToast();
  const [isReleasing, setIsReleasing] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);

  const releaseEvent = useCallback(async () => {
    if (!event?.lock_address || !event.refund_controller_address) return;

    setIsReleasing(true);
    const result = await releaseProtectedEventManager(
      event.lock_address,
      event.refund_controller_address,
      wallet,
      event.chain_id
    );
    setIsReleasing(false);

    if (!result.success) {
      toast({
        title: 'Release failed',
        description: result.error,
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Event released', description: 'The creator now manages this lock.' });
    await refreshStatus?.(result.transactionHash);
  }, [event?.chain_id, event?.lock_address, event?.refund_controller_address, refreshStatus, toast, wallet]);

  const cancelAndRefund = useCallback(async (batchSize = 50) => {
    if (!event?.lock_address || !event.refund_controller_address) return;

    if (!wallet?.address) {
      toast({
        title: 'Refund failed',
        description: 'Connect the authorized wallet to continue refunds.',
        variant: 'destructive',
      });
      return;
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
      return;
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
      return;
    }

    toast({ title: 'Refund transaction confirmed' });
    await refreshStatus?.(result.transactionHash);
  }, [authorizedRefundAddress, event?.chain_id, event?.lock_address, event?.refund_controller_address, refreshStatus, toast, wallet]);

  return {
    isReleasing,
    isRefunding,
    releaseEvent,
    cancelAndRefund,
  };
};
