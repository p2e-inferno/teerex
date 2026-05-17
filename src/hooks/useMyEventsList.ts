import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getUserEvents, mapPublishedEventRow } from '@/utils/eventUtils';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { PublishedEvent } from '@/types/event';

type UseMyEventsListState = {
  events: PublishedEvent[];
  loading: boolean;
  error: string | null;
};

export function useMyEventsList() {
  const { user, authenticated, getAccessToken } = usePrivy();
  const [state, setState] = useState<UseMyEventsListState>({
    events: [],
    loading: false,
    error: null,
  });

  const fetchEvents = useCallback(async () => {
    if (!user?.id || !authenticated) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const accessToken = await getAccessToken?.();
      let events: PublishedEvent[];

      if (accessToken) {
        const data = await callEdgeFunction<any>('list-my-manageable-events', {}, { privyToken: accessToken });
        const createdEvents = (data.created_events || []).map(mapPublishedEventRow);
        const managedEvents = (data.managed_events || []).map(mapPublishedEventRow);
        events = [...createdEvents, ...managedEvents];
      } else {
        events = await getUserEvents(user.id);
      }

      setState({ events, loading: false, error: null });
    } catch (err: any) {
      setState({
        events: [],
        loading: false,
        error: err?.message || 'Failed to load events',
      });
    }
  }, [authenticated, getAccessToken, user?.id]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events: state.events,
    loading: state.loading,
    error: state.error,
    refresh: fetchEvents,
  };
}
