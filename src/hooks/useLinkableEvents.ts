import { useInfiniteQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export type LinkableEvent = {
  id: string;
  title: string;
  lock_address: string;
  chain_id: number;
  date: string | null;
  location: string | null;
  image_url: string | null;
};

type LinkableEventsResponse = {
  ok: true;
  events: LinkableEvent[];
  total_count: number;
  has_more: boolean;
};

type UseLinkableEventsParams = {
  query: string;
  chainId?: number | null;
  enabled?: boolean;
  limit?: number;
};

export function useLinkableEvents({
  query,
  chainId,
  enabled = true,
  limit = 20,
}: UseLinkableEventsParams) {
  const normalizedQuery = query.trim();

  return useInfiniteQuery({
    queryKey: ['linkable-events', normalizedQuery, chainId ?? null, limit],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      return callEdgeFunction<LinkableEventsResponse>(
        'search-linkable-events',
        {
          q: normalizedQuery,
          chain_id: chainId ?? null,
          limit,
          offset: pageParam,
        },
        {},
      );
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.has_more) return undefined;
      return allPages.reduce((offset, page) => offset + page.events.length, 0);
    },
    enabled,
    staleTime: 30 * 1000,
  });
}
