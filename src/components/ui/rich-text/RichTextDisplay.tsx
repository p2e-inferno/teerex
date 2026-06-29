import React from 'react';
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/richText';

interface RichTextDisplayProps {
  content: string;
  className?: string;
}

export const RichTextDisplay: React.FC<RichTextDisplayProps> = ({
  content,
  className = ""
}) => {
  const sanitizedContent = sanitizeRichTextHtml(content);

  if (isRichTextEmpty(content)) {
    return (
      <div className={`text-gray-500 italic ${className}`}>
        No description provided.
      </div>
    );
  }

  return (
    <div
      className={`prose prose-gray max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
};
