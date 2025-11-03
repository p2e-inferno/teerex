import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ChevronRight, Plus } from 'lucide-react';
import { useEventPosts } from '../hooks/useEventPosts';
import { useTicketVerification } from '../hooks/useTicketVerification';
import { useCreatorPermissions } from '../hooks/useCreatorPermissions';
import { EventInteractionsDialog } from './EventInteractionsDialog';

interface EventInteractionsCardProps {
  eventId: string;
  lockAddress: string;
  creatorAddress: string;
}

export const EventInteractionsCard: React.FC<EventInteractionsCardProps> = ({
  eventId,
  lockAddress,
  creatorAddress,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { posts, isLoading, createPost, deletePost, pinPost, toggleComments } = useEventPosts(eventId);
  const { hasTicket, isChecking } = useTicketVerification(lockAddress);
  const { isCreator } = useCreatorPermissions(creatorAddress);

  // Calculate totals
  const totalPosts = posts?.length || 0;
  const totalComments = posts?.reduce((sum, post) => sum + (post.comment_count || 0), 0) || 0;

  // Loading state - only show skeleton on initial load when dialog is not open
  // Once dialog is open, let it handle its own loading state
  if (isChecking || (isLoading && !dialogOpen && totalPosts === 0)) {
    return (
      <Card className="border-0 shadow-sm animate-pulse">
        <CardContent className="py-8">
          <div className="h-24 bg-muted/40 rounded" />
        </CardContent>
      </Card>
    );
  }

  // Empty state for non-ticket holders
  if (!hasTicket) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-8 text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            Get a ticket to join the conversation
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Event Discussions</h3>
            </div>
            <Badge variant="outline" className="text-xs">
              {totalPosts} {totalPosts === 1 ? 'Post' : 'Posts'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {totalPosts === 0 ? (
            // No posts yet - show different UI for creators vs attendees
            <>
              {isCreator ? (
                // Creator: Show button to create first post
                <>
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Start the conversation with your attendees
                  </p>
                  <Button
                    variant="default"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => setDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Post
                  </Button>
                </>
              ) : (
                // Attendees: Show waiting message
                <p className="text-sm text-muted-foreground text-center py-4">
                  No posts yet. Check back soon!
                </p>
              )}
            </>
          ) : (
            // Has posts - show button for everyone
            <>
              <div className="text-sm text-muted-foreground">
                {totalComments} {totalComments === 1 ? 'comment' : 'comments'} • Active discussion
              </div>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => setDialogOpen(true)}
              >
                <span>View all discussions</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <EventInteractionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={eventId}
        lockAddress={lockAddress}
        creatorAddress={creatorAddress}
        posts={posts}
        isLoading={isLoading}
        createPost={createPost}
        deletePost={deletePost}
        pinPost={pinPost}
        toggleComments={toggleComments}
      />
    </>
  );
};
