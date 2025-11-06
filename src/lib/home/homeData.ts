import { PublishedEvent } from '@/utils/eventUtils';
import { getTotalKeys } from '@/utils/lockUtils';

export interface HomeStats {
  eventsCount: number;
  ticketsSold: number;
  creatorCount: number;
  chainsCount: number;
}

// Selects featured event with the following fallback order:
// 1) Nearest upcoming with image
// 2) Most recent (by date) with image
// 3) Nearest upcoming
// 4) Most recent (by date)
export function selectFeaturedEvent(events: PublishedEvent[]): PublishedEvent | null {
  if (!events || events.length === 0) return null;

  const now = new Date();
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

  const upcomingWithImage = events.filter(e => isUpcoming(e) && !!e.image_url).sort(bySoonest);
  if (upcomingWithImage.length > 0) return upcomingWithImage[0];

  const recentWithImage = events.filter(e => !!e.image_url).sort(byMostRecent);
  if (recentWithImage.length > 0) return recentWithImage[0];

  const upcoming = events.filter(e => isUpcoming(e)).sort(bySoonest);
  if (upcoming.length > 0) return upcoming[0];

  const recent = [...events].sort(byMostRecent);
  return recent[0] || null;
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
      const total = await getTotalKeys(e.lock_address);
      map[e.id] = total;
    } catch {
      map[e.id] = 0;
    }
  });
  await Promise.all(promises);
  return map;
}

// Computes homepage stats. ticketsSold is derived from the provided keysSoldById
// to avoid excessive on-chain calls. For v1 this is typically the sum of
// featured + upcoming keys.
export function computeHomeStats(
  events: PublishedEvent[],
  keysSoldById: Record<string, number>
): HomeStats {
  const eventsCount = events.length;
  const creatorIds = new Set(events.map(e => e.creator_id));
  const chains = new Set(events.map(e => e.chain_id));
  const ticketsSold = Object.values(keysSoldById || {}).reduce((sum, n) => sum + (n || 0), 0);

  return {
    eventsCount,
    ticketsSold,
    creatorCount: creatorIds.size,
    chainsCount: chains.size,
  };
}

