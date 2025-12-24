import React, { useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { usePostComments } from '../hooks/usePostComments';
import type { PostComment } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface CommentItemProps {
  comment: PostComment;
  canModerateComments?: boolean;
  onCommentUpdated?: (commentId: string, updates: Partial<PostComment>) => void;
  onCommentDeleted?: (commentId: string) => void;
}

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  canModerateComments = false,
  onCommentUpdated,
  onCommentDeleted,
}) => {
  const { wallets } = useWallets();
  const { user } = usePrivy();
  const { updateComment, deleteComment } = usePostComments();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if current user owns this comment
  const addresses = useMemo(() => {
    const fromWallets = (wallets || [])
      .map((wallet) => wallet?.address)
      .filter((addr): addr is string => Boolean(addr));
    const embedded = user?.wallet?.address ? [user.wallet.address] : [];
    const all = [...fromWallets, ...embedded].map((addr) => addr.toLowerCase());
    return Array.from(new Set(all));
  }, [wallets, user?.wallet?.address]);

  const isOwner = addresses.includes(comment.user_address.toLowerCase());

  // Handle edit save
  const handleSave = async () => {
    const trimmedContent = editContent.trim();

    if (!trimmedContent) {
      toast({
        title: 'Empty comment',
        description: 'Comment cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    if (trimmedContent.length > 2000) {
      toast({
        title: 'Comment too long',
        description: 'Maximum 2000 characters allowed',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await updateComment(comment.id, trimmedContent);
      setIsEditing(false);
      onCommentUpdated?.(comment.id, {
        content: trimmedContent,
        updated_at: new Date().toISOString(),
      });
      toast({
        title: 'Comment updated',
        description: 'Your comment has been updated',
      });
    } catch (error) {
      console.error('Error updating comment:', error);
      toast({
        title: 'Failed to update comment',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit cancel
  const handleCancel = () => {
    setEditContent(comment.content);
    setIsEditing(false);
  };

  // Handle delete
  const handleDelete = async () => {
    try {
      await deleteComment(comment.id);
      onCommentDeleted?.(comment.id);
      toast({
        title: 'Comment deleted',
        description: 'The comment has been removed',
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast({
        title: 'Failed to delete comment',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  const timeAgo = formatDistanceToNow(new Date(comment.created_at), { addSuffix: true });
  const wasEdited = comment.updated_at && comment.updated_at !== comment.created_at;

  return (
    <div className="flex items-start space-x-3 py-3 border-b border-border last:border-0">
      {/* Avatar placeholder */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-foreground">
              {comment.user_address.slice(0, 6)}...{comment.user_address.slice(-4)}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
            {wasEdited && (
              <span className="text-xs text-muted-foreground italic">(edited)</span>
            )}
          </div>

          {/* Edit/Delete menu - show if owner or creator */}
          {(isOwner || canModerateComments) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Edit - only owner */}
                {isOwner && !isEditing && (
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit comment
                  </DropdownMenuItem>
                )}
                {/* Delete - owner or moderator */}
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete comment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Content or editing mode */}
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              disabled={isSubmitting}
              className="min-h-[60px] resize-none text-sm"
              maxLength={2100}
            />
            <div className="flex items-center justify-between">
              <span
                className={`text-xs ${
                  editContent.length > 2000
                    ? 'text-destructive font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                {2000 - editContent.length} characters remaining
              </span>
              <div className="flex space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSubmitting || !editContent.trim() || editContent.length > 2000}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {comment.content}
          </p>
        )}
      </div>
    </div>
  );
};
