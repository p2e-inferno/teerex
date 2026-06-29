import DOMPurify from 'dompurify';

export const sanitizeRichTextHtml = (html: string) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'a',
    'span',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel',
    'class', 'style',
  ],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['onclick', 'onload', 'onerror'],
});

export const isRichTextEmpty = (html: string) => {
  const sanitized = sanitizeRichTextHtml(html).trim();
  if (!sanitized || sanitized === '<p></p>') return true;
  const text = sanitized
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
};
