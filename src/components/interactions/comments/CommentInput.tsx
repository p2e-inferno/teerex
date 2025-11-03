import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface CommentInputProps {
  postId: string;
  onSubmit: (postId: string, content: string) => Promise<void>;
  placeholder?: string;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  postId,
  onSubmit,
  placeholder = 'Write a comment...',
}) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      toast({
        title: 'Empty comment',
        description: 'Please write something before submitting',
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
      await onSubmit(postId, trimmedContent);
      setContent('');
      toast({
        title: 'Comment posted',
        description: 'Your comment has been added',
      });
    } catch (error) {
      console.error('Error posting comment:', error);
      toast({
        title: 'Failed to post comment',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-2 pt-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isSubmitting}
        className="min-h-[80px] resize-none text-sm"
        maxLength={2100}
      />
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${
            content.length > 2000
              ? 'text-destructive font-semibold'
              : 'text-muted-foreground'
          }`}
        >
          {2000 - content.length} characters remaining
        </span>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim() || content.length > 2000}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Posting...
            </>
          ) : (
            'Post Comment'
          )}
        </Button>
      </div>
    </div>
  );
};
