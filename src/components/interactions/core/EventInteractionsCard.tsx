import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ChevronRight, Plus, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useEventPosts } from '../hooks/useEventPosts';
import { useCreatorPermissions } from '../hooks/useCreatorPermissions';
import { useTicketVerification } from '../hooks/useTicketVerification';
import { useLockManagerVerification } from '../hooks/useLockManagerVerification';
import { buildEventDiscussionsPath, buildEventPostDiscussionsPath } from '@/utils/discussionsLinks';
import { prepareTextForCard } from '@/utils/textUtils';

interface EventInteractionsCardProps {
  eventId: string;
  lockAddress: string;
  creatorAddress: string;
  creatorId: string;
  chainId: number;
}

export const EventInteractionsCard: React.FC<EventInteractionsCardProps> = ({
  eventId,
  lockAddress,
  creatorAddress,
  creatorId,
  chainId,
}) => {
  const navigate = useNavigate();
  const { posts, isLoading, error: postsError, refetch: refetchPosts } = useEventPosts(eventId);
  const { hasTicket, isChecking, error, refetch } = useTicketVerification(lockAddress, chainId);
  const { isLockManager, isChecking: isCheckingManager, error: lockManagerError } = useLockManagerVerification(lockAddress, chainId);
  const { isCreator } = useCreatorPermissions(creatorAddress, creatorId);
  const canManagePosts = isCreator || isLockManager;

  const totalPosts = posts?.length || 0;
  const totalComments = posts?.reduce((sum, post) => sum + (post.comment_count || 0), 0) || 0;

  const eventIdentifier = lockAddress ? lockAddress.toLowerCase() : eventId;

  const latestPost = useMemo(() => {
    if (!posts?.length) return null;
    return [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [posts]);

  const latestPreview = useMemo(() => {
    if (!latestPost) return null;
    const preview = prepareTextForCard(latestPost.content || '', 120);
    return preview.trim().length ? preview : null;
  }, [latestPost]);

  const hasRecentUpdate = useMemo(() => {
    if (!latestPost?.created_at) return false;
    const ageMs = Date.now() - new Date(latestPost.created_at).getTime();
    return ageMs >= 0 && ageMs < 1000 * 60 * 60 * 24;
  }, [latestPost]);

  const openDiscussions = () => navigate(buildEventDiscussionsPath(eventIdentifier));
  const openLatestPost = () => {
    if (!latestPost) return;
    navigate(buildEventPostDiscussionsPath(eventIdentifier, latestPost.id));
  };

  if (isChecking || isCheckingManager || (isLoading && totalPosts === 0)) {
    return (
      <Card className="border-0 shadow-sm animate-pulse">
        <CardContent className="py-8">
          <div className="h-24 bg-muted/40 rounded" />
        </CardContent>
      </Card>
    );
  }

  if ((error || lockManagerError) && !(isCreator || isLockManager)) {
    return (
      <Card className="border-0 shadow-sm border-yellow-200 bg-yellow-50/50">
        <CardContent className="py-8 text-center space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-600" />
          <p className="text-sm font-medium text-yellow-900">
            Unable to verify access
          </p>
          <p className="text-xs text-yellow-700">
            {error?.message || lockManagerError?.message || 'Network error. Please check your connection.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-yellow-300 hover:bg-yellow-100"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!hasTicket && !isCreator && !isLockManager) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-8 text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            Get a ticket to join the conversation
          </p>
        </CardContent>
      </Card>
    );
  }

  if (postsError && totalPosts === 0) {
    return (
      <Card className="border-0 shadow-sm border-yellow-200 bg-yellow-50/50">
        <CardContent className="py-8 text-center space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-600" />
          <p className="text-sm font-medium text-yellow-900">
            Unable to load discussions
          </p>
          <p className="text-xs text-yellow-700">
            {postsError.message || 'Network error. Please check your connection.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchPosts()}
              className="border-yellow-300 hover:bg-yellow-100"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openDiscussions}
              className="border-yellow-300 hover:bg-yellow-100"
            >
              Open discussions
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden ring-1 ring-indigo-200/60 bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-indigo-950/30 dark:via-background dark:to-purple-950/20">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5">
              <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">Event Discussions</h3>
                {hasRecentUpdate && (
                  <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white text-[10px] px-2 py-0.5">
                    <Sparkles className="w-3 h-3 mr-1" />
                    New
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Updates, announcements, and comments
              </p>
            </div>
          </div>

          <Badge variant="outline" className="text-xs whitespace-nowrap bg-white/60 dark:bg-background/60">
            {totalPosts} {totalPosts === 1 ? 'Post' : 'Posts'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {latestPreview && (
          <button
            type="button"
            className="w-full text-left rounded-lg border border-indigo-200/70 bg-white/60 dark:bg-background/60 px-4 py-3 hover:bg-white/80 dark:hover:bg-background/80 transition-colors"
            onClick={openLatestPost}
            title="View the latest post"
          >
            <div className="text-[11px] uppercase tracking-wide text-indigo-700/80 dark:text-indigo-300/80 mb-1">
              Latest
            </div>
            <div className="text-sm text-foreground line-clamp-2">{latestPreview}</div>
            <div className="mt-2 text-xs text-muted-foreground">Tap to read</div>
          </button>
        )}

        {totalPosts === 0 ? (
          canManagePosts ? (
            <Button
              variant="default"
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              onClick={openDiscussions}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create first post
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-2">
              No posts yet. Check back soon!
            </div>
          )
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              {totalComments} {totalComments === 1 ? 'comment' : 'comments'} - Active discussion
            </div>
            <Button
              variant="outline"
              className="w-full justify-between border-indigo-200/70 bg-white/60 hover:bg-white dark:bg-background/60"
              onClick={openDiscussions}
            >
              <span>Open discussions</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
