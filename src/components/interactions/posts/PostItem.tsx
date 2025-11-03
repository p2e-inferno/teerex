import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThumbsUp, ThumbsDown, MessageSquare, MoreVertical, Pin, Trash2, MessageSquareOff } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PostHeader } from './PostHeader';
import { PostContent } from './PostContent';
import { CommentSection } from '../comments/CommentSection';
import type { EventPost } from '../types';

interface PostItemProps {
  post: EventPost;
  isCreator: boolean;
  onPin?: (postId: string, isPinned: boolean) => void;
  onDelete?: (postId: string) => void;
  onToggleComments?: (postId: string, enabled: boolean) => void;
}

export const PostItem: React.FC<PostItemProps> = ({
  post,
  isCreator,
  onPin,
  onDelete,
  onToggleComments,
}) => {
  const [showComments, setShowComments] = useState(false);

  const agreeCount = post.agree_count || 0;
  const disagreeCount = post.disagree_count || 0;
  const commentCount = post.comment_count || 0;

  return (
    <Card
      className={`border-0 shadow-sm ${
        post.is_pinned
          ? 'bg-blue-50 dark:bg-blue-950/20 border-l-4 border-l-blue-500'
          : 'bg-card'
      }`}
    >
      <CardContent className="pt-6 space-y-4">
        {/* Header with creator badge and timestamp */}
        <div className="flex items-start justify-between">
          <PostHeader post={post} isCreator={isCreator} />

          {/* Moderation Menu (Creator Only) */}
          {isCreator && (
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

        {/* Post Content */}
        <PostContent post={post} />

        <Separator />

        {/* Engagement Stats */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4 text-muted-foreground">
            <div className="flex items-center space-x-1">
              <ThumbsUp className="w-4 h-4" />
              <span>{agreeCount}</span>
            </div>
            <div className="flex items-center space-x-1">
              <ThumbsDown className="w-4 h-4" />
              <span>{disagreeCount}</span>
            </div>
            <div className="flex items-center space-x-1">
              <MessageSquare className="w-4 h-4" />
              <span>{commentCount}</span>
            </div>
          </div>

          {!post.comments_enabled && (
            <div className="flex items-center text-xs text-muted-foreground">
              <MessageSquareOff className="w-3 h-3 mr-1" />
              Comments disabled
            </div>
          )}
        </div>

        {/* Action Buttons - Placeholder for Phase 2 */}
        <div className="flex items-center space-x-2 pt-2">
          <Button variant="ghost" size="sm" className="flex-1">
            <ThumbsUp className="w-4 h-4 mr-1.5" />
            Agree
          </Button>
          <Button variant="ghost" size="sm" className="flex-1">
            <ThumbsDown className="w-4 h-4 mr-1.5" />
            Disagree
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            disabled={!post.comments_enabled}
            onClick={() => setShowComments(!showComments)}
          >
            <MessageSquare className="w-4 h-4 mr-1.5" />
            {showComments ? 'Hide' : 'Comment'}
          </Button>
        </div>

        {/* Comment Section */}
        {showComments && (
          <>
            <Separator />
            <CommentSection
              postId={post.id}
              creatorAddress={post.user_address}
              commentsEnabled={post.comments_enabled}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};
