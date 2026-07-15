import type { PublishedEvent } from '@/types/event';
import { isUpcomingEvent, resolveEventStart } from '@/utils/eventTime';
import { getTotalKeys } from '@/utils/lockUtils';

export interface HomeStats {
  eventsCount: number;
  ticketsSold: number;
  creatorCount: number;
  chainsCount: number;
}

export async function fetchKeysSoldForEvents(
  events: Pick<PublishedEvent, 'id' | 'lock_address' | 'chain_id'>[]
): Promise<Record<string, number>> {
  return Object.fromEntries(await Promise.all(events.map(async (event) => [
    event.id,
    await getTotalKeys(event.lock_address, event.chain_id),
  ])));
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
export function selectFeaturedEvents(events: PublishedEvent[], limit = 3, now: Date = new Date()): PublishedEvent[] {
  if (!events || events.length === 0) return [];

  const hasImage = (e: PublishedEvent) => !!e.image_url;

  const bySoonest = (a: PublishedEvent, b: PublishedEvent) => {
    const da = resolveEventStart(a)?.value.getTime() ?? Number.POSITIVE_INFINITY;
    const db = resolveEventStart(b)?.value.getTime() ?? Number.POSITIVE_INFINITY;
    return da - db;
  };

  const byMostRecent = (a: PublishedEvent, b: PublishedEvent) => {
    const da = resolveEventStart(a)?.value.getTime() ?? Number.NEGATIVE_INFINITY;
    const db = resolveEventStart(b)?.value.getTime() ?? Number.NEGATIVE_INFINITY;
    return db - da;
  };

  const withImages = events.filter(hasImage);
  if (withImages.length === 0) return [];

  const upcoming = withImages.filter((event) => isUpcomingEvent(event, now)).sort(bySoonest);
  const past = withImages.filter((event) => !isUpcomingEvent(event, now)).sort(byMostRecent);
  const combined = [...upcoming, ...past];

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
export function selectUpcomingEvents(events: PublishedEvent[], limit = 3, now: Date = new Date()): PublishedEvent[] {
  if (!events || events.length === 0) return [];
  return events
    .filter((event) => isUpcomingEvent(event, now))
    .sort((a, b) => {
      const aStart = resolveEventStart(a)?.value.getTime() ?? Number.POSITIVE_INFINITY;
      const bStart = resolveEventStart(b)?.value.getTime() ?? Number.POSITIVE_INFINITY;
      return aStart - bStart;
    })
    .slice(0, limit);
}
