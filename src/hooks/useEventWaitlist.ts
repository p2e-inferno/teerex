import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrivy } from '@privy-io/react-auth';

export type WaitlistFilter = 'all' | 'notified' | 'unnotified';

export interface WaitlistEntry {
  id: string;
  user_email: string;
  wallet_address: string | null;
  created_at: string;
  notified: boolean;
  notified_at: string | null;
}

export function useEventWaitlist(eventId: string | null, filter: WaitlistFilter = 'all') {
  const { getAccessToken } = usePrivy();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<{ total: number; notified: number; unnotified: number }>({
    total: 0,
    notified: 0,
    unnotified: 0,
  });

  const fetchWaitlist = useCallback(async (pageToLoad = 1, append = false) => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Authentication required to load waitlist');
      }
      const { data, error } = await supabase.functions.invoke('get-waitlist', {
        body: {
          event_id: eventId,
          filter,
          page: pageToLoad,
        },
        headers: {
          ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to load waitlist');

      setCounts({
        total: data.counts?.total || 0,
        notified: data.counts?.notified || 0,
        unnotified: data.counts?.unnotified || 0,
      });

      const rows: WaitlistEntry[] = data.data || [];
      setEntries((prev) => (append ? [...prev, ...rows] : rows));
      setPage(data.page || pageToLoad);
      setHasMore(!!data.has_more);
    } catch (err: any) {
      setError(err?.message || 'Failed to load waitlist');
      setEntries([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [eventId, filter, getAccessToken]);

  useEffect(() => {
    fetchWaitlist(1, false);
  }, [fetchWaitlist]);

  return {
    entries,
    loading,
    error,
    counts,
    page,
    hasMore,
    refresh: () => fetchWaitlist(1, false),
    loadMore: () => (hasMore ? fetchWaitlist(page + 1, true) : undefined),
  };
}
