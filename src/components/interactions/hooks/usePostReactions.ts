import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';
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

        const data = await callEdgeFunction<any>('create-reaction', { postId, reactionType }, { privyToken: token });
        return data?.action as 'added' | 'removed' | 'switched' | undefined;
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

