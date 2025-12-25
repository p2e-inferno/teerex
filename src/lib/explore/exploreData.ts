import { supabase } from '@/integrations/supabase/client';
import { fetchKeysSoldForEvents } from '@/lib/home/homeData';
import { mapEventRow, MappedEvent } from '@/lib/events/eventMapping';
import type { PublishedEvent } from '@/types/event';

export type SortBy = 'upcoming' | 'newest' | 'price-asc' | 'price-desc' | 'date-desc';

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
  filters: ExploreFilters = {},
  opts: { publicOnly?: boolean } = { publicOnly: true }
): Promise<ExplorePageResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('events')
    .select('*', { count: 'exact' });

  if (opts.publicOnly !== false) {
    query = query.eq('is_public', true);
  }

  // Server-side search across multiple columns
  if (filters.query && filters.query.trim() !== '') {
    const q = `%${filters.query.trim()}%`;
    query = query.or(
      `title.ilike.${q},description.ilike.${q},location.ilike.${q},category.ilike.${q}`
    );
  }

  if (filters.category && filters.category.trim() !== '') {
    query = query.eq('category', filters.category.trim());
  }

  if (filters.isFree === true) {
    query = query.contains('payment_methods', ['free']);
  } else if (filters.isFree === false) {
    query = query.not('payment_methods', 'cs', '{free}');
  }

  if (filters.dateFrom) {
    query = query.gte('date', filters.dateFrom.toISOString());
  }
  if (filters.dateTo) {
    query = query.lte('date', filters.dateTo.toISOString());
  }

  // Sorting
  switch (filters.sortBy) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'price-asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price-desc':
      query = query.order('price', { ascending: false });
      break;
    case 'upcoming':
      // Upcoming by date asc, nulls last so undated events don't dominate
      query = query.order('date', { ascending: true, nullsFirst: false });
      break;
    case 'date-desc':
    default:
      // Most recent event dates first (no default date filter)
      query = query.order('date', { ascending: false, nullsFirst: false });
      break;
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error('Error fetching events page:', error);
    return { events: [], totalCount: 0, hasMore: false };
  }

  const events = (data || []).map(mapEventRow);
  const totalCount = count ?? events.length;
  const hasMore = to + 1 < totalCount;

  return { events, totalCount, hasMore };
}

export async function fetchKeysForPage(events: PublishedEvent[]): Promise<Record<string, number>> {
  return fetchKeysSoldForEvents(events);
}
