import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Pin, Crown } from 'lucide-react';
import type { EventPost } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface PostHeaderProps {
  post: EventPost;
  isCreator: boolean;
}

export const PostHeader: React.FC<PostHeaderProps> = ({ post }) => {
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });

  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center space-x-2">
        {/* Creator Badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30">
          <Crown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            Event Creator
          </span>
        </div>

        {/* Pin Badge */}
        {post.is_pinned && (
          <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
            <Pin className="w-3 h-3 mr-1" />
            Pinned
          </Badge>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {timeAgo}
      </div>
    </div>
  );
};
