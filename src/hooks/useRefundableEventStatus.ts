import { useCallback, useEffect, useMemo, useState } from 'react';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { PublishedEvent } from '@/types/event';

export type RefundableEventStatus =
  | 'protected'
  | 'threshold_met'
  | 'released'
  | 'refund_available'
  | 'refund_in_progress'
  | 'refunded'
  | 'creator_only_refund_window';

export interface RefundableEventStatusState {
  status: RefundableEventStatus | null;
  attendeeCount: number;
  minAttendees: number;
  thresholdMet: boolean;
  currentRefundReserve: string | null;
  requiredFullRefund: string | null;
  refundComplete: boolean;
  cancelInitiated: boolean;
  managerReleased: boolean;
  authorizedRefundCaller: boolean;
  authorizedRefundAddress: string | null;
  controllerAddress: string | null;
  creatorAddress: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: (txHash?: string) => Promise<void>;
}

export const useRefundableEventStatus = (
  event: PublishedEvent | null,
  userAddresses: string[] = []
): RefundableEventStatusState => {
  const [state, setState] = useState<Omit<RefundableEventStatusState, 'refresh'>>({
    status: (event?.refund_status as RefundableEventStatus | null) || null,
    attendeeCount: 0,
    minAttendees: event?.refund_min_attendees || 0,
    thresholdMet: false,
    currentRefundReserve: null,
    requiredFullRefund: null,
    refundComplete: false,
    cancelInitiated: false,
    managerReleased: false,
    authorizedRefundCaller: false,
    authorizedRefundAddress: null,
    controllerAddress: event?.refund_controller_address || null,
    creatorAddress: null,
    isLoading: false,
    error: null,
  });

  const accounts = useMemo(
    () => userAddresses.filter((addr) => /^0x[0-9a-fA-F]{40}$/.test(addr)),
    [userAddresses]
  );

  const refresh = useCallback(async (txHash?: string) => {
    if (!event?.id || !event.refund_protection_enabled) return;

    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const data = await callEdgeFunction<any>('sync-refundable-event-status', { event_id: event.id, accounts, tx_hash: txHash }, {});
      setState({
        status: data.status,
        attendeeCount: Number(data.attendee_count || 0),
        minAttendees: Number(data.min_attendees || event.refund_min_attendees || 0),
        thresholdMet: Boolean(data.threshold_met),
        currentRefundReserve: data.current_refund_reserve || null,
        requiredFullRefund: data.required_full_refund || null,
        refundComplete: Boolean(data.refund_complete),
        cancelInitiated: Boolean(data.cancel_initiated),
        managerReleased: Boolean(data.manager_released),
        authorizedRefundCaller: Boolean(data.authorized_refund_caller),
        authorizedRefundAddress: data.authorized_refund_address || null,
        controllerAddress: data.controller_address || event.refund_controller_address || null,
        creatorAddress: data.creator || null,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      setState((current) => ({ ...current, isLoading: false, error: err?.message || 'Failed to sync status' }));
    }
  }, [accounts, event?.id, event?.refund_controller_address, event?.refund_min_attendees, event?.refund_protection_enabled]);

  useEffect(() => {
    setState((current) => ({
      ...current,
      status: (event?.refund_status as RefundableEventStatus | null) || null,
      minAttendees: event?.refund_min_attendees || 0,
      controllerAddress: event?.refund_controller_address || null,
      authorizedRefundAddress: current.authorizedRefundAddress,
      creatorAddress: current.creatorAddress,
    }));
  }, [event?.id, event?.refund_controller_address, event?.refund_min_attendees, event?.refund_status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
};
