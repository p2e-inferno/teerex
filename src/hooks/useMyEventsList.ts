import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getUserEvents, PublishedEvent } from '@/utils/eventUtils';

type UseMyEventsListState = {
  events: PublishedEvent[];
  loading: boolean;
  error: string | null;
};

export function useMyEventsList() {
  const { user } = usePrivy();
  const [state, setState] = useState<UseMyEventsListState>({
    events: [],
    loading: false,
    error: null,
  });

  const fetchEvents = useCallback(async () => {
    if (!user?.id) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const events = await getUserEvents(user.id);
      setState({ events, loading: false, error: null });
    } catch (err: any) {
      setState({
        events: [],
        loading: false,
        error: err?.message || 'Failed to load events',
      });
    }
  }, [user?.id]);

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
