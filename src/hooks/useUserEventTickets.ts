import { useEffect, useState, useCallback, useMemo } from 'react';
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
  const addressesKey = useMemo(
    () => JSON.stringify(userAddresses.map(a => a.toLowerCase()).sort()),
    [userAddresses]
  );
  const eventIdsKey = useMemo(
    () => JSON.stringify([...eventIds].sort()),
    [eventIds]
  );
  const normalizedUserAddresses = useMemo(() => JSON.parse(addressesKey) as string[], [addressesKey]);
  const normalizedEventIds = useMemo(() => JSON.parse(eventIdsKey) as string[], [eventIdsKey]);

  // Fetch user's tickets for specified events
  const fetchUserTickets = useCallback(async () => {
    if (!normalizedUserAddresses.length || !normalizedEventIds.length) {
      setOwnedEventIds(new Set());
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('event_id')
        .in('event_id', normalizedEventIds)
        .in('owner_wallet', normalizedUserAddresses);

      if (error) throw error;

      const owned = new Set(data?.map((t) => t.event_id) ?? []);
      setOwnedEventIds(owned);
    } catch (error) {
      console.error('Failed to fetch user tickets:', error);
      setOwnedEventIds(new Set());
    }
  }, [normalizedEventIds, normalizedUserAddresses]);

  // Initial fetch
  useEffect(() => {
    fetchUserTickets();
  }, [fetchUserTickets]);

  // Subscribe to real-time ticket changes
  useEffect(() => {
    if (!normalizedUserAddresses.length || !normalizedEventIds.length) return;

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
            normalizedEventIds.includes(eventId) &&
            normalizedUserAddresses.includes(ownerWallet)
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
  }, [fetchUserTickets, normalizedEventIds, normalizedUserAddresses]);

  return ownedEventIds;
}
