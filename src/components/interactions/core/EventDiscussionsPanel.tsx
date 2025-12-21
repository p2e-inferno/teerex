import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Loader2, Copy, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PostComposer } from '../posts/PostComposer';
import { PostList } from '../posts/PostList';
import { useEventPosts } from '../hooks/useEventPosts';
import { useCreatorPermissions } from '../hooks/useCreatorPermissions';
import { useTicketVerification } from '../hooks/useTicketVerification';
import { toast } from '@/hooks/use-toast';
import { buildEventDiscussionsPath } from '@/utils/discussionsLinks';
import { prepareTextForCard } from '@/utils/textUtils';

interface EventDiscussionsPanelProps {
  eventId: string;
  eventIdentifier: string;
  lockAddress: string;
  chainId: number;
  creatorId: string;
  highlightPostId?: string | null;
}

export const EventDiscussionsPanel: React.FC<EventDiscussionsPanelProps> = ({
  eventId,
  eventIdentifier,
  lockAddress,
  chainId,
  creatorId,
  highlightPostId,
}) => {
  const { posts, isLoading, error: postsError, refetch: refetchPosts, createPost, deletePost, pinPost, toggleComments } = useEventPosts(eventId);
  const { isCreator, isChecking: isCheckingCreator } = useCreatorPermissions(creatorId);
  const { hasTicket, isChecking: isCheckingTicket, error: ticketError, refetch } = useTicketVerification(lockAddress, chainId);
  const toastRef = useRef(toast);

  const [activeTab, setActiveTab] = useState<'all' | 'pinned'>('all');
  const [highlightId, setHighlightId] = useState<string | null>(highlightPostId || null);
  const missingPostToastRef = useRef<string | null>(null);


  const canView = isCreator || hasTicket;

  const totalPosts = posts?.length || 0;
  const totalComments = posts?.reduce((sum, post) => sum + (post.comment_count || 0), 0) || 0;

  const latestPost = useMemo(() => {
    if (!posts?.length) return null;
    return [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [posts]);

  const latestPreview = useMemo(() => {
    if (!latestPost) return null;
    const preview = prepareTextForCard(latestPost.content || '', 140);
    return preview.trim().length ? preview : null;
  }, [latestPost]);

  useEffect(() => {
    setHighlightId(highlightPostId || null);
  }, [highlightPostId]);

  useEffect(() => {
    if (!highlightId) return;
    if (!posts?.some((p) => p.id === highlightId)) return;

    const timeout = window.setTimeout(() => {
      setHighlightId(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [highlightId, posts]);

  useEffect(() => {
    if (!highlightId || isLoading || postsError) return;
    if (posts?.some((p) => p.id === highlightId)) {
      missingPostToastRef.current = null;
      return;
    }
    if (missingPostToastRef.current === highlightId) return;

    missingPostToastRef.current = highlightId;
    toastRef.current({
      title: 'Post not found',
      description: 'This post may have been deleted or is no longer available.',
    });
    setHighlightId(null);
  }, [highlightId, isLoading, posts, postsError]);

  const handleCopyDiscussionsLink = async () => {
    try {
      const url = `${window.location.origin}${buildEventDiscussionsPath(eventIdentifier)}`;
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Link copied',
        description: 'Event discussions link copied to clipboard.',
      });
    } catch (e) {
      toast({
        title: 'Copy failed',
        description: 'Could not copy the link.',
        variant: 'destructive',
      });
    }
  };

  const isChecking = isCheckingCreator || isCheckingTicket;

  if (isChecking || (isLoading && totalPosts === 0)) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (ticketError && !isCreator) {
    return (
      <Card className="border-0 shadow-sm border-yellow-200 bg-yellow-50/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-foreground">Event Discussions</h2>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-yellow-900 font-medium">Unable to verify ticket status</p>
          <p className="text-xs text-yellow-700">{ticketError.message || 'Network error. Please try again.'}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="border-yellow-300 hover:bg-yellow-100">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canView) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Event Discussions</h2>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Get a ticket to join the conversation.</p>
        </CardContent>
      </Card>
    );
  }

  if (postsError && totalPosts === 0) {
    return (
      <Card className="border-0 shadow-sm border-yellow-200 bg-yellow-50/50">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-700" />
            <h2 className="font-semibold text-foreground">Event Discussions</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-yellow-900 font-medium">Unable to load discussions</p>
          <p className="text-xs text-yellow-700">{postsError.message || 'Network error. Please try again.'}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchPosts()} className="border-yellow-300 hover:bg-yellow-100">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyDiscussionsLink} className="border-yellow-300 hover:bg-yellow-100">
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Event Discussions</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Announcements and updates from the event team
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-9 px-2 flex-shrink-0" onClick={handleCopyDiscussionsLink} title="Copy discussions link">
            <Copy className="w-4 h-4" />
          </Button>
        </div>

        {latestPreview && (
          <button
            type="button"
            className="mt-4 w-full text-left rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground hover:bg-muted/40 transition-colors"
            onClick={() => {
              if (!latestPost) return;
              setActiveTab('all');
              setHighlightId(latestPost.id);
            }}
            title="Jump to the latest post"
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Latest update</div>
            <div className="line-clamp-3">{latestPreview}</div>
            <div className="mt-2 text-xs text-muted-foreground">Tap to view the post</div>
          </button>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-4">
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {totalPosts} {totalPosts === 1 ? 'Post' : 'Posts'}
          </Badge>
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {totalComments} {totalComments === 1 ? 'Comment' : 'Comments'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {postsError && totalPosts > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 px-4 py-3 text-sm text-yellow-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-700" />
              <span>Having trouble updating discussions.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchPosts()}
              className="border-yellow-300 hover:bg-yellow-100"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'pinned')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="all">All Posts</TabsTrigger>
            <TabsTrigger value="pinned">Pinned</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-4">
            {isCreator && <PostComposer createPost={createPost} />}
            <PostList
              eventIdentifier={eventIdentifier}
              posts={posts}
              isLoading={isLoading}
              creatorId={creatorId}
              filterPinned={false}
              deletePost={deletePost}
              pinPost={pinPost}
              toggleComments={toggleComments}
              highlightPostId={highlightId}
            />
          </TabsContent>

          <TabsContent value="pinned" className="mt-4 space-y-4">
            <PostList
              eventIdentifier={eventIdentifier}
              posts={posts}
              isLoading={isLoading}
              creatorId={creatorId}
              filterPinned={true}
              deletePost={deletePost}
              pinPost={pinPost}
              toggleComments={toggleComments}
              highlightPostId={highlightId}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
