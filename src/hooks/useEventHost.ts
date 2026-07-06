import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { mapEventRow, type MappedEvent } from '@/lib/events/eventMapping';

export interface HostInfo {
  display_name: string | null;
  creator_address: string | null;
  hosted_public_count: number;
}

export interface RecentHolder {
  wallet: string;
  display_name: string | null;
}

export interface EventHostSummary {
  host: HostInfo;
  social: {
    ticket_holder_count: number;
    recent_holders: RecentHolder[];
  };
}

export interface HostProfileData {
  host: HostInfo;
  events: MappedEvent[];
}

export function useEventHostSummary(eventId?: string | null) {
  return useQuery<EventHostSummary>({
    queryKey: ['event-host-summary', eventId ?? null],
    enabled: Boolean(eventId),
    queryFn: () =>
      callEdgeFunction<EventHostSummary>('event-host', { route: 'summary', event_id: eventId }, {}),
  });
}

export function useHostOtherEvents(eventId?: string | null) {
  return useQuery<MappedEvent[]>({
    queryKey: ['host-other-events', eventId ?? null],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const data = await callEdgeFunction<{ events: any[] }>(
        'event-host',
        { route: 'other-events', event_id: eventId },
        {},
      );
      return (data.events ?? []).map(mapEventRow);
    },
  });
}

export interface HostOtherEventsInfiniteResponse {
  events: MappedEvent[];
  has_more: boolean;
  total_count: number;
}

export function useHostOtherEventsInfinite(eventId?: string | null, limit = 6) {
  return useInfiniteQuery({
    queryKey: ['host-other-events-infinite', eventId ?? null, limit],
    enabled: Boolean(eventId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const data = await callEdgeFunction<{ events: any[]; has_more: boolean; total_count: number }>(
        'event-host',
        { route: 'other-events', event_id: eventId, limit, offset: pageParam },
        {},
      );
      return {
        events: (data.events ?? []).map(mapEventRow),
        has_more: !!data.has_more,
        total_count: data.total_count ?? 0,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.has_more) return undefined;
      return allPages.reduce((offset, page) => offset + page.events.length, 0);
    },
    staleTime: 30 * 1000,
  });
}

export function useHostProfile(address?: string | null) {
  return useQuery<HostProfileData>({
    queryKey: ['host-profile', address ?? null],
    enabled: Boolean(address),
    queryFn: async () => {
      const data = await callEdgeFunction<{ host: HostInfo; events: any[] }>(
        'event-host',
        { route: 'profile', address },
        {},
      );
      return { host: data.host, events: (data.events ?? []).map(mapEventRow) };
    },
  });
}
