import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PublishedEvent } from '@/utils/eventUtils';
import { fetchKeysSoldForEvents } from '@/lib/home/homeData';

/**
 * Hook to subscribe to real-time ticket updates for multiple events
 * Optimizes by only refetching counts for events that changed
 */
export function useMultiEventTicketRealtime(events: PublishedEvent[]) {
  const [keysSoldMap, setKeysSoldMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const eventsRef = useRef<PublishedEvent[]>([]);

  // Fetch ticket counts for all events
  const refreshAllTicketCounts = useCallback(async () => {
    if (events.length === 0) {
      setKeysSoldMap({});
      setIsLoading(false);
      return;
    }

    try {
      const keys = await fetchKeysSoldForEvents(events);
      setKeysSoldMap(keys);
    } catch (error) {
      console.error('Failed to fetch ticket counts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [events]);

  // Refresh single event's ticket count
  const refreshEventTicketCount = useCallback(async (eventId: string) => {
    const event = eventsRef.current.find(e => e.id === eventId);
    if (!event) return;

    try {
      const keys = await fetchKeysSoldForEvents([event]);
      setKeysSoldMap(prev => ({ ...prev, ...keys }));
    } catch (error) {
      console.error(`Failed to refresh ticket count for event ${eventId}:`, error);
    }
  }, []);

  // Update events ref when events change
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Initial fetch
  useEffect(() => {
    refreshAllTicketCounts();
  }, [refreshAllTicketCounts]);

  // Subscribe to ticket changes for ALL events
  useEffect(() => {
    if (events.length === 0) return;

    const eventIds = events.map(e => e.id);

    // Create a single channel for all events
    const channel = supabase
      .channel('multi-event-tickets')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          const ticketData = payload.new as any;
          const eventId = ticketData?.event_id;

          // Only refresh if this ticket belongs to one of our displayed events
          if (eventId && eventIds.includes(eventId)) {
            console.log(`[Realtime] Ticket change for event ${eventId}`);
            refreshEventTicketCount(eventId);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed to multi-event tickets');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error:', err);
        }
      });

    // Cleanup
    return () => {
      console.log('[Realtime] Unsubscribing from multi-event tickets');
      channel.unsubscribe();
    };
  }, [events, refreshEventTicketCount]);

  return {
    keysSoldMap,
    isLoading,
    refreshAllTicketCounts, // Manual refresh for all
    refreshEventTicketCount, // Manual refresh for single event
  };
}
