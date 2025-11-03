import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import type { UsePostReactionsReturn } from '../types';

/**
 * Hook to manage post reactions (agree/disagree)
 * Provides function to toggle reactions on posts
 */
export const usePostReactions = (): UsePostReactionsReturn => {
  const { getAccessToken } = usePrivy();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Toggle reaction (agree or disagree)
  const toggleReaction = useCallback(
    async (postId: string, reactionType: 'agree' | 'disagree') => {
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      try {
        setIsLoading(true);
        setError(null);

        const { data, error: invokeError } = await supabase.functions.invoke('create-reaction', {
          body: { postId, reactionType },
          headers: { 'X-Privy-Authorization': `Bearer ${token}` },
        });

        if (invokeError) {
          console.error('Error creating reaction:', invokeError);
          throw invokeError;
        }

        if (!data?.ok) {
          const errorMessage = data?.error || 'Failed to create reaction';
          console.error('Error creating reaction:', errorMessage);
          throw new Error(errorMessage);
        }

        // Reaction will be updated via Realtime subscription
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error occurred');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [getAccessToken]
  );

  return {
    toggleReaction,
    isLoading,
    error,
  };
};

