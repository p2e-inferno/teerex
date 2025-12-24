import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { CommentList } from './CommentList';
import { CommentInput } from './CommentInput';
import { Loader2 } from 'lucide-react';
import type { PostComment } from '../types';

interface CommentSectionProps {
  postId: string;
  commentsEnabled: boolean;
  canModerateComments?: boolean;
  onCommentDelta?: (delta: number) => void;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  commentsEnabled,
  canModerateComments = false,
  onCommentDelta,
}) => {
  const { getAccessToken, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const walletKey = useMemo(
    () =>
      (wallets || [])
        .map((w) => w?.address?.toLowerCase())
        .filter(Boolean)
        .join(','),
    [wallets]
  );
  const [comments, setComments] = useState<PostComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAllowed, setIsAllowed] = useState(true);

  // Fetch comments for this post
  const fetchComments = useCallback(async () => {
    if (!postId || !commentsEnabled) return;

    try {
      setIsLoading(true);
      setError(null);
      setIsAllowed(true);

      const token = await getAccessToken?.();
      if (!token) {
        setComments([]);
        setIsAllowed(false);
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke('get-post-comments', {
        body: { postId },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || 'Failed to load comments');

      if (!data.allowed) {
        setComments([]);
        setIsAllowed(false);
        return;
      }

      setComments((data.comments as PostComment[]) || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [postId, commentsEnabled, getAccessToken, walletKey]);

  // Initial fetch
  useEffect(() => {
    fetchComments();
  }, [fetchComments, authenticated, walletKey]);

  // Create comment via edge function
  const handleCreateComment = useCallback(
    async (postId: string, content: string) => {
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase.functions.invoke('create-comment', {
        body: { postId, content: content.trim() },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (error) {
        console.error('Error creating comment:', error);
        throw error;
      }

      if (!data?.ok) {
        const errorMessage = data?.error || 'Failed to create comment';
        console.error('Error creating comment:', errorMessage);
        throw new Error(errorMessage);
      }

      const created = (data.comment as PostComment) || null;
      if (created) {
        setComments((prev) => [...prev, created]);
      }
      onCommentDelta?.(1);
    },
    [getAccessToken, onCommentDelta]
  );

  const handleCommentUpdated = useCallback(
    (commentId: string, updates: Partial<PostComment>) => {
      setComments((prev) =>
        prev.map((comment) => (comment.id === commentId ? { ...comment, ...updates } : comment))
      );
    },
    []
  );

  const handleCommentDeleted = useCallback(
    (commentId: string) => {
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
      onCommentDelta?.(-1);
    },
    [onCommentDelta]
  );

  if (!commentsEnabled) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">Comments are disabled for this post</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-destructive">Failed to load comments</p>
        <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">Get a ticket to view comments</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommentList
        comments={comments}
        canModerateComments={canModerateComments}
        onCommentUpdated={handleCommentUpdated}
        onCommentDeleted={handleCommentDeleted}
      />
      <CommentInput postId={postId} onSubmit={handleCreateComment} />
    </div>
  );
};
