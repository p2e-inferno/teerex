import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PostComposer } from '../posts/PostComposer';
import { PostList } from '../posts/PostList';
import { useCreatorPermissions } from '../hooks/useCreatorPermissions';
import { MessageSquare, Loader2 } from 'lucide-react';
import type { EventPost } from '../types';

interface EventInteractionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  lockAddress: string;
  creatorAddress: string;
  posts: EventPost[];
  isLoading: boolean;
  createPost: (content: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  pinPost: (postId: string, isPinned: boolean) => Promise<void>;
  toggleComments: (postId: string, enabled: boolean) => Promise<void>;
}

export const EventInteractionsDialog: React.FC<EventInteractionsDialogProps> = ({
  open,
  onOpenChange,
  creatorAddress,
  posts,
  isLoading,
  createPost,
  deletePost,
  pinPost,
  toggleComments,
}) => {
  const { isCreator } = useCreatorPermissions(creatorAddress);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-2 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded">
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* Loading overlay - subtle indicator for background updates */}
          {isLoading && posts.length > 0 && (
            <div className="absolute top-0 right-0 z-10 p-4">
              <div className="flex items-center space-x-2 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border shadow-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Updating...</span>
              </div>
            </div>
          )}

          <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <span>Event Discussions</span>
          </DialogTitle>
          <DialogDescription>
            View and interact with announcements and posts from the event creator
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="all" className="flex-1 flex flex-col overflow-hidden px-6 pb-6">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="all">All Posts</TabsTrigger>
            <TabsTrigger value="pinned">Pinned</TabsTrigger>
          </TabsList>

          <TabsContent
            value="all"
            className="flex-1 overflow-y-auto mt-0 space-y-4 pr-2"
            style={{ scrollbarGutter: 'stable' }}
          >
            {/* Creator can compose posts */}
            {isCreator && <PostComposer createPost={createPost} />}

            {/* All posts list */}
            <PostList
              posts={posts}
              isLoading={isLoading}
              creatorAddress={creatorAddress}
              filterPinned={false}
              deletePost={deletePost}
              pinPost={pinPost}
              toggleComments={toggleComments}
            />
          </TabsContent>

          <TabsContent
            value="pinned"
            className="flex-1 overflow-y-auto mt-0 space-y-4 pr-2"
            style={{ scrollbarGutter: 'stable' }}
          >
            {/* Pinned posts only */}
            <PostList
              posts={posts}
              isLoading={isLoading}
              creatorAddress={creatorAddress}
              filterPinned={true}
              deletePost={deletePost}
              pinPost={pinPost}
              toggleComments={toggleComments}
            />
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
