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
import { MessageSquare } from 'lucide-react';
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
  eventId,
  lockAddress,
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
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
      </DialogContent>
    </Dialog>
  );
};
