import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTotalKeys } from '@/utils/lockUtils';

interface UseEventTicketRealtimeOptions {
  eventId: string;
  lockAddress: string;
  chainId: number;
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time ticket purchase updates for an event
 * Combines database subscriptions with on-chain data fetching
 */
export function useEventTicketRealtime({
  eventId,
  lockAddress,
  chainId,
  enabled = true,
}: UseEventTicketRealtimeOptions) {
  const [ticketsSold, setTicketsSold] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current ticket count from chain
  const refreshTicketCount = useCallback(async () => {
    try {
      const sold = await getTotalKeys(lockAddress, chainId);
      setTicketsSold(sold);
    } catch (error) {
      console.error('Failed to fetch ticket count:', error);
    } finally {
      setIsLoading(false);
    }
  }, [lockAddress, chainId]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    // Initial fetch
    refreshTicketCount();

    // Subscribe to ticket table changes for this event
    const channel = supabase
      .channel(`event-tickets-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'tickets',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('[Realtime] Ticket change detected:', payload);
          // Refetch on-chain count to ensure accuracy
          refreshTicketCount();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to tickets for event ${eventId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error:', err);
        } else if (status === 'CLOSED') {
          console.log('[Realtime] Channel closed');
        }
      });

    // Cleanup on unmount
    return () => {
      console.log(`[Realtime] Unsubscribing from event ${eventId}`);
      channel.unsubscribe();
    };
  }, [eventId, enabled, refreshTicketCount]);

  return {
    ticketsSold,
    isLoading,
    refreshTicketCount, // Expose manual refresh function
  };
}
