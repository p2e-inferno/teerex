/* deno-lint-ignore-file no-explicit-any */

/**
 * Formats a date string to YYYY-MM-DD format or returns a fallback value
 * Used for consistent date formatting across the application
 *
 * @param dateStr - Date string to format (ISO format expected)
 * @param fallback - Fallback value if date is invalid or null (default: 'TBA')
 * @returns Formatted date string in YYYY-MM-DD format or fallback
 */
export function formatEventDate(dateStr: string | null, fallback: string = 'TBA'): string {
  if (!dateStr) return fallback;
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch (error) {
    console.warn('Invalid date format:', dateStr, error);
    return fallback;
  }
}
