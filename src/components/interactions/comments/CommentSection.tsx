import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { CommentList } from './CommentList';
import { CommentInput } from './CommentInput';
import { Loader2 } from 'lucide-react';
import type { PostComment } from '../types';

interface CommentSectionProps {
  postId: string;
  creatorAddress: string;
  commentsEnabled: boolean;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  creatorAddress,
  commentsEnabled,
}) => {
  const { getAccessToken } = usePrivy();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch comments for this post
  const fetchComments = useCallback(async () => {
    if (!postId) return;

    try {
      setIsLoading(true);
      setError(null);

      const res: any = await supabase
        .from('post_comments' as any)
        .select('*')
        .eq('post_id', postId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (res.error) throw res.error;

      setComments((res.data as PostComment[]) || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  // Initial fetch
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Realtime subscription
  useEffect(() => {
    if (!postId) return;

    console.log('[Realtime] Setting up comment subscription for post:', postId);

    const channel = supabase
      .channel(`post-comments-${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          console.log('[Realtime] New comment:', payload.new);
          const newComment = payload.new as PostComment;
          if (!newComment.is_deleted) {
            setComments((prev) => [...prev, newComment]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          console.log('[Realtime] Updated comment:', payload.new);
          const updatedComment = payload.new as PostComment;
          if (updatedComment.is_deleted) {
            // Remove deleted comment
            setComments((prev) => prev.filter((c) => c.id !== updatedComment.id));
          } else {
            // Update comment content
            setComments((prev) =>
              prev.map((c) => (c.id === updatedComment.id ? updatedComment : c))
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          console.log('[Realtime] Deleted comment:', payload.old);
          setComments((prev) => prev.filter((c) => c.id !== (payload.old as PostComment).id));
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Comment subscription status:', status);
      });

    return () => {
      console.log('[Realtime] Cleaning up comment subscription for post:', postId);
      channel.unsubscribe();
    };
  }, [postId]);

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

      // Comment will be added via Realtime subscription
    },
    [getAccessToken]
  );

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

  if (!commentsEnabled) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">Comments are disabled for this post</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommentList comments={comments} creatorAddress={creatorAddress} />
      <CommentInput postId={postId} onSubmit={handleCreateComment} />
    </div>
  );
};
