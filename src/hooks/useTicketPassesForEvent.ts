import { useTicketPasses } from '@/hooks/useTicketPasses';

/**
 * Active Ticket Passes explicitly linked to an event (via target_event_address = event lock address).
 * Single source of truth for "passes that unlock this event", used by both the event→pass onramp
 * and the filtered passes explorer. Matching is explicit/creator-curated; a token-symbol fallback
 * can be added here later without changing call sites.
 */
export function useTicketPassesForEvent(lockAddress?: string | null, options?: { enabled?: boolean }) {
  return useTicketPasses(
    { target_event_address: lockAddress ? lockAddress.toLowerCase() : undefined, status: 'ACTIVE' },
    { enabled: (options?.enabled ?? true) && !!lockAddress },
  );
}
