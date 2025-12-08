import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to get the waitlist count for an event
 * Returns the number of people on the waitlist without exposing their emails
 */
export const useWaitlistCount = (eventId: string | null) => {
  const [count, setCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!eventId) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc('get_waitlist_count', {
          p_event_id: eventId,
        });

        if (rpcError) throw rpcError;
        setCount(data || 0);
      } catch (err) {
        console.error('Error fetching waitlist count:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch waitlist count'));
        setCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCount();
  }, [eventId]);

  return { count, isLoading, error };
};
