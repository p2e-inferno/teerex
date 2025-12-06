import { PublishedEvent } from '@/utils/eventUtils';
import { getTotalKeys } from '@/utils/lockUtils';
import { supabase } from '@/integrations/supabase/client';

export interface HomeStats {
  eventsCount: number;
  ticketsSold: number;
  creatorCount: number;
  chainsCount: number;
}

/**
 * Fetches total number of active tickets sold across the entire platform.
 * Uses database query instead of on-chain calls for better performance.
 * @returns Total count of active tickets
 */
export async function getTotalTicketsSold(): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) {
    console.error('Error fetching total tickets sold:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Selects up to `limit` featured events for carousel display.
 * Only returns events with images. Prioritizes upcoming events by soonest date,
 * then falls back to most recent events.
 *
 * @param events All published events
 * @param limit Maximum number of events to return (default: 3)
 * @returns Array of featured events (0 to limit)
 */
export function selectFeaturedEvents(events: PublishedEvent[], limit = 3): PublishedEvent[] {
  if (!events || events.length === 0) return [];

  const now = new Date();

  // Helper functions
  const hasImage = (e: PublishedEvent) => !!e.image_url;
  const isUpcoming = (e: PublishedEvent) => e.date && e.date >= now;

  const bySoonest = (a: PublishedEvent, b: PublishedEvent) => {
    const da = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY;
    const db = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY;
    return da - db;
  };

  const byMostRecent = (a: PublishedEvent, b: PublishedEvent) => {
    const da = a.date ? a.date.getTime() : Number.NEGATIVE_INFINITY;
    const db = b.date ? b.date.getTime() : Number.NEGATIVE_INFINITY;
    return db - da;
  };

  // Filter: Only events with images
  const withImages = events.filter(hasImage);
  if (withImages.length === 0) return [];

  // Separate upcoming and past events
  const upcoming = withImages.filter(isUpcoming).sort(bySoonest);
  const past = withImages.filter(e => !isUpcoming(e)).sort(byMostRecent);

  // Combine: upcoming first, then past events
  const combined = [...upcoming, ...past];

  // Return up to limit
  return combined.slice(0, limit);
}

/**
 * Legacy function: Returns single featured event.
 * Uses selectFeaturedEvents internally for consistency.
 *
 * @param events All published events
 * @returns Single featured event or null
 */
export function selectFeaturedEvent(events: PublishedEvent[]): PublishedEvent | null {
  const featured = selectFeaturedEvents(events, 1);
  return featured.length > 0 ? featured[0] : null;
}

// Returns first `limit` upcoming events sorted by date ascending.
// Includes sold-out events by design.
export function selectUpcomingEvents(events: PublishedEvent[], limit = 3): PublishedEvent[] {
  if (!events || events.length === 0) return [];
  const now = new Date();
  return events
    .filter(e => e.date && e.date >= now)
    .sort((a, b) => (a.date!.getTime() - b.date!.getTime()))
    .slice(0, limit);
}

// Fetches keys sold for the provided events. Returns a map of event.id -> keysSold.
export async function fetchKeysSoldForEvents(events: PublishedEvent[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (!events || events.length === 0) return map;
  const promises = events.map(async (e) => {
    try {
      const total = await getTotalKeys(e.lock_address, e.chain_id);
      map[e.id] = total;
    } catch {
      map[e.id] = 0;
    }
  });
  await Promise.all(promises);
  return map;
}

/**
 * Computes homepage stats from published events and total ticket count.
 * @param events All published events
 * @param totalTickets Total number of active tickets sold platform-wide
 * @returns Homepage statistics
 */
export function computeHomeStats(
  events: PublishedEvent[],
  totalTickets: number
): HomeStats {
  const eventsCount = events.length;
  const creatorIds = new Set(events.map(e => e.creator_id));
  const chains = new Set(events.map(e => e.chain_id));

  return {
    eventsCount,
    ticketsSold: totalTickets,
    creatorCount: creatorIds.size,
    chainsCount: chains.size,
  };
}
