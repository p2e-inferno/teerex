import { useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';

export interface UsePostCommentsReturn {
  updateComment: (commentId: string, content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

/**
 * Hook to manage post comments
 * Provides functions to update and delete comments
 */
export const usePostComments = (): UsePostCommentsReturn => {
  const { getAccessToken } = usePrivy();

  // Update comment content
  const updateComment = useCallback(
    async (commentId: string, content: string) => {
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase.functions.invoke('update-comment', {
        body: { commentId, updates: { content: content.trim() } },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (error) {
        console.error('Error updating comment:', error);
        throw error;
      }

      if (!data?.ok) {
        const errorMessage = data?.error || 'Failed to update comment';
        console.error('Error updating comment:', errorMessage);
        throw new Error(errorMessage);
      }
    },
    [getAccessToken]
  );

  // Delete comment
  const deleteComment = useCallback(
    async (commentId: string) => {
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase.functions.invoke('update-comment', {
        body: { commentId, updates: { is_deleted: true } },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (error) {
        console.error('Error deleting comment:', error);
        throw error;
      }

      if (!data?.ok) {
        const errorMessage = data?.error || 'Failed to delete comment';
        console.error('Error deleting comment:', errorMessage);
        throw new Error(errorMessage);
      }
    },
    [getAccessToken]
  );

  return {
    updateComment,
    deleteComment,
  };
};
