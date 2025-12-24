import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import type { EventPost, UseEventPostsReturn } from '../types';

/**
 * Hook to manage event posts via protected Edge Functions
 * Handles CRUD operations with explicit refresh
 */
export const useEventPosts = (eventId: string): UseEventPostsReturn => {
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

  const [posts, setPosts] = useState<EventPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const normalizePost = useCallback((post: EventPost): EventPost => {
    return {
      agree_count: 0,
      disagree_count: 0,
      comment_count: 0,
      engagement_score: 0,
      user_has_reacted_agree: false,
      user_has_reacted_disagree: false,
      ...post,
    };
  }, []);

  // Fetch posts with engagement stats and user reactions
  const fetchPosts = useCallback(async (opts?: { background?: boolean }) => {
    if (!eventId) return;
    const isBackground = opts?.background;

    try {
      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const token = await getAccessToken?.();
      console.debug('useEventPosts: invoking get-event-discussions', {
        eventId,
        tokenPresent: Boolean(token),
        walletKey,
      });
      if (!token) {
        setPosts([]);
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke('get-event-discussions', {
        body: { eventId },
        headers: { 'X-Privy-Authorization': `Bearer ${token}` },
      });

      console.debug('useEventPosts: get-event-discussions response', {
        eventId,
        ok: data?.ok,
        allowed: data?.allowed,
        postCount: data?.posts?.length,
        invokeError: invokeError?.message,
      });

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || 'Failed to load discussions');

      if (!data.allowed) {
        setPosts([]);
        return;
      }

      setPosts(((data.posts as EventPost[]) || []).map(normalizePost));
    } catch (err) {
      console.error('useEventPosts: error fetching posts', { eventId, walletKey }, err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [eventId, getAccessToken, walletKey, normalizePost]);

  // Store latest fetchPosts in ref to avoid stale closures
  const fetchPostsRef = useRef(fetchPosts);
  useEffect(() => {
    fetchPostsRef.current = fetchPosts;
  }, [fetchPosts]);

  // Initial fetch
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts, authenticated, walletKey]);

  // No Realtime subscription here: discussions are loaded via protected Edge Function.

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

      const newPost = normalizePost((data.post as EventPost) || { id: data.postId, event_id: eventId, content });
      setPosts((prev) => [newPost, ...prev]);
      fetchPostsRef.current({ background: true });
    },
    [eventId, getAccessToken, normalizePost]
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

      setPosts((prev) => prev.filter((p) => p.id !== postId));
      fetchPostsRef.current({ background: true });
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

      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, is_pinned: isPinned } : p))
      );
      fetchPostsRef.current({ background: true });
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

      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments_enabled: enabled } : p))
      );
      fetchPostsRef.current({ background: true });
    },
    [getAccessToken]
  );

  const applyReactionOptimistic = useCallback(
    (postId: string, reactionType: 'agree' | 'disagree', action: 'added' | 'removed' | 'switched') => {
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post;

          let agree = post.agree_count || 0;
          let disagree = post.disagree_count || 0;
          let userAgree = post.user_has_reacted_agree || false;
          let userDisagree = post.user_has_reacted_disagree || false;

          if (action === 'removed') {
            if (reactionType === 'agree') {
              agree = Math.max(0, agree - 1);
              userAgree = false;
            } else {
              disagree = Math.max(0, disagree - 1);
              userDisagree = false;
            }
          } else if (action === 'added') {
            if (reactionType === 'agree') {
              agree += 1;
              userAgree = true;
              userDisagree = false;
            } else {
              disagree += 1;
              userDisagree = true;
              userAgree = false;
            }
          } else if (action === 'switched') {
            if (reactionType === 'agree') {
              agree += 1;
              disagree = Math.max(0, disagree - 1);
              userAgree = true;
              userDisagree = false;
            } else {
              disagree += 1;
              agree = Math.max(0, agree - 1);
              userDisagree = true;
              userAgree = false;
            }
          }

          return {
            ...post,
            agree_count: agree,
            disagree_count: disagree,
            user_has_reacted_agree: userAgree,
            user_has_reacted_disagree: userDisagree,
          };
        })
      );
      fetchPostsRef.current({ background: true });
    },
    []
  );

  const applyCommentDelta = useCallback((postId: string, delta: number) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, comment_count: Math.max(0, (post.comment_count || 0) + delta) }
          : post
      )
    );
    fetchPostsRef.current({ background: true });
  }, []);

  return {
    posts,
    isLoading,
    isRefreshing,
    error,
    createPost,
    deletePost,
    pinPost,
    toggleComments,
    applyReactionOptimistic,
    applyCommentDelta,
    refetch: () => fetchPostsRef.current({ background: true }),
  };
};
