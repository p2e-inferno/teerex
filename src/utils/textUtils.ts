/**
 * Utility functions for text processing and formatting
 */

/**
 * Strips HTML tags from a string, returning plain text
 */
export const stripHtml = (html: string): string => {
  if (!html) return '';

  // Create a temporary DOM element to parse HTML
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Get text content (handles nested elements properly)
  return tmp.textContent || tmp.innerText || '';
};

/**
 * Truncates text to a specified length, adding ellipsis if truncated
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

/**
 * Combines HTML stripping and text truncation for card displays
 */
export const prepareTextForCard = (html: string, maxLength?: number): string => {
  const plainText = stripHtml(html);
  return maxLength ? truncateText(plainText, maxLength) : plainText;
};

/**
 * Checks if HTML content is essentially empty (only whitespace/tags)
 */
export const isEmptyHtml = (html: string): boolean => {
  if (!html) return true;
  const plainText = stripHtml(html);
  return plainText.trim().length === 0;
};
