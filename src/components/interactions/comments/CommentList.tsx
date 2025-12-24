import React from 'react';
import { CommentItem } from './CommentItem';
import type { PostComment } from '../types';

interface CommentListProps {
  comments: PostComment[];
  canModerateComments?: boolean;
  onCommentUpdated?: (commentId: string, updates: Partial<PostComment>) => void;
  onCommentDeleted?: (commentId: string) => void;
}

export const CommentList: React.FC<CommentListProps> = ({
  comments,
  canModerateComments = false,
  onCommentUpdated,
  onCommentDeleted,
}) => {
  // Sort comments by created_at (oldest first for conversation flow)
  const sortedComments = [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Empty state
  if (sortedComments.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No comments yet</p>
        <p className="text-xs text-muted-foreground mt-1">Be the first to comment!</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {sortedComments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          canModerateComments={canModerateComments}
          onCommentUpdated={onCommentUpdated}
          onCommentDeleted={onCommentDeleted}
        />
      ))}
    </div>
  );
};
