import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to check which events the user owns tickets for
 * Batch queries tickets table and subscribes to real-time changes
 *
 * @param userAddresses - Array of wallet addresses to check (lowercased)
 * @param eventIds - Array of event IDs to check against
 * @returns Set of event IDs where user owns a ticket
 */
export function useUserEventTickets(
  userAddresses: string[],
  eventIds: string[]
): Set<string> {
  const [ownedEventIds, setOwnedEventIds] = useState<Set<string>>(new Set());

  // Stringify addresses and IDs for stable dependency comparison
  const addressesKey = JSON.stringify(userAddresses.map(a => a.toLowerCase()).sort());
  const eventIdsKey = JSON.stringify([...eventIds].sort());

  // Fetch user's tickets for specified events
  const fetchUserTickets = useCallback(async () => {
    if (!userAddresses.length || !eventIds.length) {
      setOwnedEventIds(new Set());
      return;
    }

    try {
      const lowercasedAddresses = userAddresses.map((addr) => addr.toLowerCase());

      const { data, error } = await supabase
        .from('tickets')
        .select('event_id')
        .in('event_id', eventIds)
        .in('owner_wallet', lowercasedAddresses);

      if (error) throw error;

      const owned = new Set(data?.map((t) => t.event_id) ?? []);
      setOwnedEventIds(owned);
    } catch (error) {
      console.error('Failed to fetch user tickets:', error);
      setOwnedEventIds(new Set());
    }
  }, [addressesKey, eventIdsKey]);

  // Initial fetch
  useEffect(() => {
    fetchUserTickets();
  }, [fetchUserTickets]);

  // Subscribe to real-time ticket changes
  useEffect(() => {
    if (!userAddresses.length || !eventIds.length) return;

    const channel = supabase
      .channel('user-event-tickets')
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
          const ownerWallet = ticketData?.owner_wallet?.toLowerCase();

          // Only update if this ticket belongs to one of our events and user
          if (
            eventId &&
            eventIds.includes(eventId) &&
            userAddresses.some((addr) => addr.toLowerCase() === ownerWallet)
          ) {
            // Refetch to get accurate ownership state
            fetchUserTickets();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [addressesKey, eventIdsKey, fetchUserTickets]);

  return ownedEventIds;
}
