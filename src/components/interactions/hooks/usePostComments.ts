import { useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export interface UsePostCommentsReturn {
  updateComment: (commentId: string, content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

export const usePostComments = (): UsePostCommentsReturn => {
  const { getAccessToken } = usePrivy();

  const updateComment = useCallback(
    async (commentId: string, content: string) => {
      const token = await getAccessToken?.();
      if (!token) throw new Error('Authentication required');
      await callEdgeFunction('update-comment', { commentId, updates: { content: content.trim() } }, { privyToken: token });
    },
    [getAccessToken]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const token = await getAccessToken?.();
      if (!token) throw new Error('Authentication required');
      await callEdgeFunction('update-comment', { commentId, updates: { is_deleted: true } }, { privyToken: token });
    },
    [getAccessToken]
  );

  return { updateComment, deleteComment };
};
