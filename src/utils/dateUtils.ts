import { format, isSameDay } from 'date-fns';

export interface DateDisplayOptions {
  startDate: Date;
  endDate?: Date | null;
  formatStyle?: 'short' | 'long';
}

/**
 * Formats event date range intelligently based on start and end dates
 *
 * Single day: "MMM d, yyyy" or "EEEE, MMMM do, yyyy" (long)
 * Multi-day same month: "MMM d - d, yyyy" or "MMMM do - do, yyyy" (long)
 * Multi-day different months: "MMM d - MMM d, yyyy" or "MMMM do - MMMM do, yyyy" (long)
 * Multi-day different years: "MMM d, yyyy - MMM d, yyyy" or "MMMM do, yyyy - MMMM do, yyyy" (long)
 *
 * @param options - Start date, optional end date, and format style
 * @returns Formatted date string
 *
 * @example
 * // Single day
 * formatEventDateRange({ startDate: new Date('2025-01-15'), endDate: null })
 * // => "Jan 15, 2025"
 *
 * @example
 * // Multi-day same month
 * formatEventDateRange({
 *   startDate: new Date('2025-01-15'),
 *   endDate: new Date('2025-01-18')
 * })
 * // => "Jan 15 - 18, 2025"
 *
 * @example
 * // Multi-day different months
 * formatEventDateRange({
 *   startDate: new Date('2025-01-28'),
 *   endDate: new Date('2025-02-02')
 * })
 * // => "Jan 28 - Feb 2, 2025"
 */
export function formatEventDateRange(options: DateDisplayOptions): string {
  const { startDate, endDate, formatStyle = 'short' } = options;

  // Single day event (no end date or same as start date)
  if (!endDate || isSameDay(startDate, endDate)) {
    return formatStyle === 'long'
      ? format(startDate, 'EEEE, MMMM do, yyyy')
      : format(startDate, 'MMM d, yyyy');
  }

  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const startMonth = startDate.getMonth();
  const endMonth = endDate.getMonth();

  // Different years
  if (startYear !== endYear) {
    return formatStyle === 'long'
      ? `${format(startDate, 'MMMM do, yyyy')} - ${format(endDate, 'MMMM do, yyyy')}`
      : `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
  }

  // Same year, different months
  if (startMonth !== endMonth) {
    return formatStyle === 'long'
      ? `${format(startDate, 'MMMM do')} - ${format(endDate, 'MMMM do, yyyy')}`
      : `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
  }

  // Same month and year
  return formatStyle === 'long'
    ? `${format(startDate, 'MMMM do')} - ${format(endDate, 'do, yyyy')}`
    : `${format(startDate, 'MMM d')} - ${format(endDate, 'd, yyyy')}`;
}

/**
 * Checks if event is currently ongoing (between start and end dates inclusive)
 *
 * @param startDate - Event start date
 * @param endDate - Optional event end date (defaults to start date for single-day events)
 * @returns True if current time is within event period
 *
 * @example
 * isEventOngoing(new Date('2025-01-15'), new Date('2025-01-18'))
 * // Returns true if today is between Jan 15-18, 2025
 */
export function isEventOngoing(startDate: Date, endDate?: Date | null): boolean {
  const now = new Date();
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = endDate ? new Date(endDate) : new Date(startDate);
  end.setHours(23, 59, 59, 999);

  return now >= start && now <= end;
}

/**
 * Checks if event has ended
 *
 * @param startDate - Event start date
 * @param endDate - Optional event end date (defaults to start date for single-day events)
 * @returns True if event has concluded
 *
 * @example
 * hasEventEnded(new Date('2025-01-15'), new Date('2025-01-18'))
 * // Returns true if today is after Jan 18, 2025
 */
export function hasEventEnded(startDate: Date, endDate?: Date | null): boolean {
  const now = new Date();
  const end = endDate ? new Date(endDate) : new Date(startDate);
  end.setHours(23, 59, 59, 999);

  return now > end;
}
