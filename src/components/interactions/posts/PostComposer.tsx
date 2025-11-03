import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PostComposerProps {
  createPost: (content: string) => Promise<void>;
}

const MAX_POST_LENGTH = 5000;

export const PostComposer: React.FC<PostComposerProps> = ({ createPost }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      toast({
        title: 'Empty post',
        description: 'Please write something before posting',
        variant: 'destructive',
      });
      return;
    }

    if (trimmedContent.length > MAX_POST_LENGTH) {
      toast({
        title: 'Post too long',
        description: `Maximum ${MAX_POST_LENGTH} characters allowed`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await createPost(trimmedContent);

      // Clear form on success
      setContent('');

      toast({
        title: 'Post created!',
        description: 'Your announcement has been posted to attendees',
      });
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        title: 'Failed to create post',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = MAX_POST_LENGTH - content.length;
  const isOverLimit = remainingChars < 0;

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="post-content" className="text-sm font-medium text-foreground">
              Create Announcement
            </label>
            <span
              className={`text-xs ${
                isOverLimit
                  ? 'text-destructive font-semibold'
                  : remainingChars < 100
                  ? 'text-orange-600'
                  : 'text-muted-foreground'
              }`}
            >
              {remainingChars} characters remaining
            </span>
          </div>

          <Textarea
            id="post-content"
            placeholder="Share updates, important info, or announcements with your attendees..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSubmitting}
            className="min-h-[120px] resize-none"
            maxLength={MAX_POST_LENGTH + 100} // Allow typing slightly over for visual feedback
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !content.trim() || isOverLimit}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Posting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Post Announcement
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
