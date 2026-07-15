import { callEdgeFunction } from '@/lib/edgeFunctions';
import { mapEventRow, type MappedEvent } from '@/lib/events/eventMapping';
import type { HomeStats } from '@/lib/home/homeData';

export type PublicEventSort = 'upcoming' | 'newest' | 'price-asc' | 'price-desc' | 'date-desc';

export interface PublicEventQuery {
  query?: string;
  category?: string;
  isFree?: boolean | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  sort?: PublicEventSort;
  upcomingOnly?: boolean;
  hasImage?: boolean;
  eventIds?: string[];
  limit?: number;
  offset?: number;
  includeStats?: boolean;
}

export interface PublicEventsResult {
  events: MappedEvent[];
  totalCount: number;
  hasMore: boolean;
  stats?: HomeStats;
}

interface PublicEventsResponse {
  events?: unknown[];
  total_count?: number;
  has_more?: boolean;
  stats?: {
    events_count: number;
    tickets_sold: number;
    creator_count: number;
    chains_count: number;
  };
}

export async function fetchPublicEvents(params: PublicEventQuery = {}): Promise<PublicEventsResult> {
  const data = await callEdgeFunction<PublicEventsResponse>('public-events', {
    ...(params.query ? { query: params.query } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(params.isFree != null ? { is_free: params.isFree } : {}),
    ...(params.dateFrom ? { date_from: params.dateFrom.toISOString() } : {}),
    ...(params.dateTo ? { date_to: params.dateTo.toISOString() } : {}),
    ...(params.sort ? { sort: params.sort } : {}),
    ...(params.upcomingOnly ? { upcoming_only: true } : {}),
    ...(params.hasImage ? { has_image: true } : {}),
    ...(params.eventIds?.length ? { event_ids: params.eventIds } : {}),
    ...(params.limit ? { limit: params.limit } : {}),
    ...(params.offset ? { offset: params.offset } : {}),
    ...(params.includeStats ? { include_stats: true } : {}),
  }, {});

  return {
    events: (data.events ?? []).map(mapEventRow),
    totalCount: data.total_count ?? 0,
    hasMore: data.has_more ?? false,
    ...(data.stats
      ? {
          stats: {
            eventsCount: data.stats.events_count,
            ticketsSold: data.stats.tickets_sold,
            creatorCount: data.stats.creator_count,
            chainsCount: data.stats.chains_count,
          },
        }
      : {}),
  };
}
