import { supabase } from '@/integrations/supabase/client';
import { PublishedEvent } from '@/utils/eventUtils';
import { fetchKeysSoldForEvents } from '@/lib/home/homeData';

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
  events: PublishedEvent[];
  totalCount: number;
  hasMore: boolean;
}

const mapEventRow = (event: any): PublishedEvent => ({
  ...event,
  date: event.date ? new Date(event.date) : null,
  created_at: new Date(event.created_at),
  updated_at: new Date(event.updated_at),
  currency: event.currency as 'ETH' | 'USDC' | 'FREE',
  ngn_price: event.ngn_price || 0,
  payment_methods: event.payment_methods || ['crypto'],
  paystack_public_key: event.paystack_public_key,
});

export async function fetchEventsPage(
  page: number,
  pageSize: number,
  filters: ExploreFilters = {}
): Promise<ExplorePageResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('events')
    .select('*', { count: 'exact' });

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
    query = query.eq('currency', 'FREE');
  } else if (filters.isFree === false) {
    query = query.neq('currency', 'FREE');
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
