import React from 'react';
import { PostItem } from './PostItem';
import { useCreatorPermissions } from '../hooks/useCreatorPermissions';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { EventPost } from '../types';

interface PostListProps {
  posts: EventPost[];
  isLoading: boolean;
  creatorAddress: string;
  filterPinned?: boolean;
  deletePost: (postId: string) => Promise<void>;
  pinPost: (postId: string, isPinned: boolean) => Promise<void>;
  toggleComments: (postId: string, enabled: boolean) => Promise<void>;
}

export const PostList: React.FC<PostListProps> = ({
  posts,
  isLoading,
  creatorAddress,
  filterPinned = false,
  deletePost,
  pinPost,
  toggleComments,
}) => {
  const { isCreator } = useCreatorPermissions(creatorAddress);

  // Filter posts if needed
  const displayPosts = filterPinned
    ? posts.filter((p) => p.is_pinned)
    : posts;

  const handlePin = async (postId: string, isPinned: boolean) => {
    try {
      await pinPost(postId, isPinned);
      toast({
        title: isPinned ? 'Post pinned' : 'Post unpinned',
        description: isPinned ? 'This post will appear at the top' : 'Post removed from pinned section',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update post',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await deletePost(postId);
      toast({
        title: 'Post deleted',
        description: 'The post has been removed',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete post',
        variant: 'destructive',
      });
    }
  };

  const handleToggleComments = async (postId: string, enabled: boolean) => {
    try {
      await toggleComments(postId, enabled);
      toast({
        title: enabled ? 'Comments enabled' : 'Comments disabled',
        description: enabled
          ? 'Attendees can now comment on this post'
          : 'Attendees can no longer comment on this post',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update post',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (displayPosts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">
          {filterPinned
            ? 'No pinned posts yet'
            : 'No posts yet. Check back soon for updates from the event creator!'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" id="posts">
      {displayPosts.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          isCreator={isCreator}
          onPin={handlePin}
          onDelete={handleDelete}
          onToggleComments={handleToggleComments}
        />
      ))}
    </div>
  );
};
