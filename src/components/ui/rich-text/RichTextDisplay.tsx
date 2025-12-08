import React from 'react';
import DOMPurify from 'dompurify';

interface RichTextDisplayProps {
  content: string;
  className?: string;
}

export const RichTextDisplay: React.FC<RichTextDisplayProps> = ({
  content,
  className = ""
}) => {
  // Sanitize content for display to prevent XSS attacks
  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'a',
      'span'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'class', 'style'
    ],
    // Ensure links open safely
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onclick', 'onload', 'onerror']
  });

  // Handle empty content gracefully
  if (!content || content.trim() === '<p></p>' || content.trim() === '') {
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
