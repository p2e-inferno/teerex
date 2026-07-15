import type { MappedEvent } from '@/lib/events/eventMapping';
import { fetchPublicEvents, type PublicEventSort } from '@/lib/events/publicEvents';

export type SortBy = PublicEventSort;

export interface ExploreFilters {
  query?: string;
  category?: string;
  isFree?: boolean | null; // true -> FREE only, false -> paid only, null -> all
  dateFrom?: Date | null;
  dateTo?: Date | null;
  sortBy?: SortBy;
}

export interface ExplorePageResult {
  events: MappedEvent[];
  totalCount: number;
  hasMore: boolean;
}

export async function fetchEventsPage(
  page: number,
  pageSize: number,
  filters: ExploreFilters = {}
): Promise<ExplorePageResult> {
  const result = await fetchPublicEvents({
    query: filters.query,
    category: filters.category,
    isFree: filters.isFree,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sort: filters.sortBy,
    upcomingOnly: filters.sortBy === 'upcoming',
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return { events: result.events, totalCount: result.totalCount, hasMore: result.hasMore };
}
