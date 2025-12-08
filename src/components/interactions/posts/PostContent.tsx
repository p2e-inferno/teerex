import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import type { EventPost } from '../types';

interface PostContentProps {
  post: EventPost;
}

const MAX_PREVIEW_LENGTH = 300;

export const PostContent: React.FC<PostContentProps> = ({ post }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract plain text from HTML for truncation check
  const plainTextContent = post.content.replace(/<[^>]*>/g, '').trim();
  const shouldTruncate = plainTextContent.length > MAX_PREVIEW_LENGTH;

  // For truncation, we need to truncate the HTML content intelligently
  const getTruncatedContent = (htmlContent: string, maxLength: number) => {
    if (!shouldTruncate || isExpanded) return htmlContent;

    const plainText = htmlContent.replace(/<[^>]*>/g, '');
    if (plainText.length <= maxLength) return htmlContent;

    // Find where to cut in the HTML while preserving tag structure
    let charCount = 0;
    let result = '';
    const tagRegex = /(<[^>]*>)|([^<]+)/g;
    let match;

    while ((match = tagRegex.exec(htmlContent)) !== null) {
      const [fullMatch, tag, text] = match;

      if (tag) {
        // It's a tag, include it
        result += tag;
      } else if (text) {
        // It's text content
        if (charCount + text.length <= maxLength) {
          result += text;
          charCount += text.length;
        } else {
          // Truncate this text portion
          const remainingChars = maxLength - charCount;
          result += text.slice(0, remainingChars) + '...';
          break;
        }
      }
    }

    return result;
  };

  const displayContent = getTruncatedContent(post.content, MAX_PREVIEW_LENGTH);

  return (
    <div className="space-y-2">
      <RichTextDisplay
        content={displayContent}
        className="text-sm text-foreground"
      />

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
