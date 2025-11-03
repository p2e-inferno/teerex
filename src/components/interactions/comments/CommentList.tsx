import React from 'react';
import { CommentItem } from './CommentItem';
import type { PostComment } from '../types';

interface CommentListProps {
  comments: PostComment[];
  creatorAddress: string;
}

export const CommentList: React.FC<CommentListProps> = ({ comments, creatorAddress }) => {
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
        <CommentItem key={comment.id} comment={comment} creatorAddress={creatorAddress} />
      ))}
    </div>
  );
};
