import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { EventPost } from '../types';

interface PostContentProps {
  post: EventPost;
}

const MAX_PREVIEW_LENGTH = 300;

export const PostContent: React.FC<PostContentProps> = ({ post }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldTruncate = post.content.length > MAX_PREVIEW_LENGTH;
  const displayContent = isExpanded || !shouldTruncate
    ? post.content
    : post.content.slice(0, MAX_PREVIEW_LENGTH) + '...';

  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
        {displayContent}
      </p>

      {shouldTruncate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 h-auto p-0 font-medium"
        >
          {isExpanded ? 'Read less' : 'Read more'}
        </Button>
      )}
    </div>
  );
};
