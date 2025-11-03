import { useState, useEffect, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import type { EventPost, UseEventPostsReturn, EventPostWithStats } from '../types';

/**
 * Hook to manage event posts with Realtime subscriptions
 * Handles CRUD operations and live updates
 */
export const useEventPosts = (eventId: string): UseEventPostsReturn => {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const { getAccessToken } = usePrivy();

  const [posts, setPosts] = useState<EventPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch posts with engagement stats and user reactions
  const fetchPosts = useCallback(async () => {
    if (!eventId) return;

    try {
      setIsLoading(true);
      setError(null);

      // Query posts with stats
      const { data: postsData, error: postsError } = await supabase
        .from('event_posts')
        .select(`
          *,
          post_engagement_stats (*),
          post_reactions (*)
        `)
        .eq('event_id', eventId)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;

      // Transform data and add user-specific flags
      const userAddress = wallet?.address?.toLowerCase();
      const transformedPosts: EventPost[] = (postsData as EventPostWithStats[] || []).map((post) => {
        const stats = post.post_engagement_stats;
        const userReactions = post.post_reactions.filter(
          (r) => r.user_address.toLowerCase() === userAddress
        );

        return {
          ...post,
          agree_count: stats?.agree_count || 0,
          disagree_count: stats?.disagree_count || 0,
          comment_count: stats?.comment_count || 0,
          engagement_score: stats?.engagement_score || 0,
          user_has_reacted_agree: userReactions.some((r) => r.reaction_type === 'agree'),
          user_has_reacted_disagree: userReactions.some((r) => r.reaction_type === 'disagree'),
        };
      });

      setPosts(transformedPosts);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [eventId, wallet?.address]);

  // Initial fetch
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Realtime subscription
  useEffect(() => {
    if (!eventId) return;

    console.log('[Realtime] Setting up subscription for event:', eventId);

    const channel = supabase
      .channel(`event-posts-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_posts',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('[Realtime] New post:', payload.new);
          fetchPosts(); // Refetch to get stats
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'event_posts',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('[Realtime] Updated post:', payload.new);
          fetchPosts(); // Refetch to get stats
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'event_posts',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('[Realtime] Deleted post:', payload.old);
          setPosts((prev) => prev.filter((p) => p.id !== (payload.old as EventPost).id));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_reactions',
        },
        () => {
          // Refetch when reactions change to update counts
          fetchPosts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_engagement_stats',
        },
        () => {
          // Refetch when stats change
          fetchPosts();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      console.log('[Realtime] Cleaning up subscription for event:', eventId);
      channel.unsubscribe();
    };
  }, [eventId]); // Only depend on eventId, not fetchPosts

  // Create a new post
  const createPost = useCallback(
    async (content: string) => {
      if (!eventId) {
        throw new Error('Event ID missing');
      }

      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase.functions.invoke('create-post', {
        body: { eventId, content },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (error) {
        console.error('Error creating post:', error);
        throw error;
      }

      if (!data?.ok) {
        const errorMessage = data?.error || 'Failed to create post';
        console.error('Error creating post:', errorMessage);
        throw new Error(errorMessage);
      }

      // Posts will be added via Realtime subscription
    },
    [eventId, getAccessToken]
  );

  // Delete a post
  const deletePost = useCallback(
    async (postId: string) => {
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase.functions.invoke('update-post', {
        body: { postId, updates: { is_deleted: true } },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (error) {
        console.error('Error deleting post:', error);
        throw error;
      }

      if (!data?.ok) {
        const errorMessage = data?.error || 'Failed to delete post';
        console.error('Error deleting post:', errorMessage);
        throw new Error(errorMessage);
      }

      // Update will be handled by Realtime subscription
    },
    [getAccessToken]
  );

  // Pin/unpin a post
  const pinPost = useCallback(
    async (postId: string, isPinned: boolean) => {
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase.functions.invoke('update-post', {
        body: { postId, updates: { is_pinned: isPinned } },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (error) {
        console.error('Error pinning post:', error);
        throw error;
      }

      if (!data?.ok) {
        const errorMessage = data?.error || 'Failed to pin post';
        console.error('Error pinning post:', errorMessage);
        throw new Error(errorMessage);
      }

      // Update will be handled by Realtime subscription
    },
    [getAccessToken]
  );

  // Toggle comments on a post
  const toggleComments = useCallback(
    async (postId: string, enabled: boolean) => {
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase.functions.invoke('update-post', {
        body: { postId, updates: { comments_enabled: enabled } },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      if (error) {
        console.error('Error toggling comments:', error);
        throw error;
      }

      if (!data?.ok) {
        const errorMessage = data?.error || 'Failed to toggle comments';
        console.error('Error toggling comments:', errorMessage);
        throw new Error(errorMessage);
      }

      // Update will be handled by Realtime subscription
    },
    [getAccessToken]
  );

  return {
    posts,
    isLoading,
    error,
    createPost,
    deletePost,
    pinPost,
    toggleComments,
    refetch: fetchPosts,
  };
};
