import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThumbsUp, ThumbsDown, MessageSquare, MoreVertical, Pin, Trash2, MessageSquareOff, Link2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PostHeader } from './PostHeader';
import { PostContent } from './PostContent';
import { CommentSection } from '../comments/CommentSection';
import { usePostReactions } from '../hooks/usePostReactions';
import { toast } from '@/hooks/use-toast';
import { buildEventPostDiscussionsUrl } from '@/utils/discussionsLinks';
import type { EventPost } from '../types';

interface PostItemProps {
  post: EventPost;
  canManagePosts: boolean;
  eventIdentifier: string;
  isHighlighted?: boolean;
  autoExpandComments?: boolean;
  onPin?: (postId: string, isPinned: boolean) => void;
  onDelete?: (postId: string) => void;
  onToggleComments?: (postId: string, enabled: boolean) => void;
  onReactionApplied?: (
    postId: string,
    reactionType: 'agree' | 'disagree',
    action: 'added' | 'removed' | 'switched'
  ) => void;
  onCommentDelta?: (postId: string, delta: number) => void;
}

export const PostItem: React.FC<PostItemProps> = ({
  post,
  canManagePosts,
  eventIdentifier,
  isHighlighted = false,
  autoExpandComments = false,
  onPin,
  onDelete,
  onToggleComments,
  onReactionApplied,
  onCommentDelta,
}) => {
  const [showComments, setShowComments] = useState(false);
  const { toggleReaction } = usePostReactions();
  const [reactingType, setReactingType] = useState<'agree' | 'disagree' | null>(null);
  const isReacting = reactingType !== null;

  const agreeCount = post.agree_count || 0;
  const disagreeCount = post.disagree_count || 0;
  const commentCount = post.comment_count || 0;

  React.useEffect(() => {
    if (autoExpandComments) {
      setShowComments(true);
    }
  }, [autoExpandComments]);

  const handleCopyLink = async () => {
    try {
      const url = buildEventPostDiscussionsUrl(eventIdentifier, post.id);
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Link copied',
        description: 'Post link copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: 'Could not copy the post link.',
        variant: 'destructive',
      });
    }
  };

  // Handle agree reaction
  const handleAgree = async () => {
    try {
      setReactingType('agree');
      const action = await toggleReaction(post.id, 'agree');
      if (action) {
        onReactionApplied?.(post.id, 'agree', action);
      }
    } catch (error) {
      toast({
        title: 'Failed to react',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setReactingType(null);
    }
  };

  // Handle disagree reaction
  const handleDisagree = async () => {
    try {
      setReactingType('disagree');
      const action = await toggleReaction(post.id, 'disagree');
      if (action) {
        onReactionApplied?.(post.id, 'disagree', action);
      }
    } catch (error) {
      toast({
        title: 'Failed to react',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setReactingType(null);
    }
  };

  return (
    <Card
      id={`post-${post.id}`}
      className={`border-0 shadow-sm scroll-mt-24 transition-colors ${
        post.is_pinned
          ? 'bg-blue-50 dark:bg-blue-950/20 border-l-4 border-l-blue-500'
          : 'bg-card'
      } ${isHighlighted ? 'ring-2 ring-blue-500/60 bg-blue-50/40 dark:bg-blue-950/10' : ''}`}
    >
      <CardContent className="pt-6 space-y-4">
        {/* Header with creator badge and timestamp */}
        <div className="flex items-start justify-between">
          <PostHeader post={post} />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleCopyLink}
              title="Copy link to this post"
            >
              <Link2 className="w-4 h-4" />
            </Button>

          {/* Moderation Menu (Creator Only) */}
          {canManagePosts && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onPin?.(post.id, !post.is_pinned)}>
                  <Pin className="w-4 h-4 mr-2" />
                  {post.is_pinned ? 'Unpin' : 'Pin'} post
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleComments?.(post.id, !post.comments_enabled)}>
                  <MessageSquareOff className="w-4 h-4 mr-2" />
                  {post.comments_enabled ? 'Disable' : 'Enable'} comments
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this post?')) {
                      onDelete?.(post.id);
                    }
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          </div>
        </div>

        {/* Post Content */}
        <PostContent post={post} />

        <Separator />

        {/* Engagement Stats - Clickable Icons */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4 text-muted-foreground">
            {/* Thumbs Up - Clickable */}
            <button
              onClick={handleAgree}
              disabled={isReacting}
              className={`flex items-center space-x-1 transition-colors hover:text-blue-600 dark:hover:text-blue-400 ${
                post.user_has_reacted_agree
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-muted-foreground'
              } ${isReacting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <ThumbsUp className="w-4 h-4" />
              <span>{agreeCount}</span>
            </button>

            {/* Thumbs Down - Clickable */}
            <button
              onClick={handleDisagree}
              disabled={isReacting}
              className={`flex items-center space-x-1 transition-colors hover:text-red-600 dark:hover:text-red-400 ${
                post.user_has_reacted_disagree
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'
              } ${isReacting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <ThumbsDown className="w-4 h-4" />
              <span>{disagreeCount}</span>
            </button>

            {/* Comment Icon - Clickable */}
            <button
              onClick={() => setShowComments(!showComments)}
              disabled={!post.comments_enabled}
              className={`flex items-center space-x-1 transition-colors hover:text-primary ${
                showComments ? 'text-primary' : 'text-muted-foreground'
              } ${
                !post.comments_enabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>{commentCount}</span>
            </button>
          </div>

          {!post.comments_enabled && (
            <div className="flex items-center text-xs text-muted-foreground">
              <MessageSquareOff className="w-3 h-3 mr-1" />
              Comments disabled
            </div>
          )}
        </div>

        {/* Comment Section */}
        {showComments && (
          <>
            <Separator />
            <CommentSection
              postId={post.id}
              commentsEnabled={post.comments_enabled}
              canModerateComments={canManagePosts}
              onCommentDelta={(delta) => onCommentDelta?.(post.id, delta)}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};
