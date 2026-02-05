import type { PublishedEvent } from '@/types/event';

type RegistrationCheckInput = Pick<PublishedEvent, 'registration_cutoff' | 'starts_at' | 'date'>;

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Checks if an event's registration is closed based on cutoff, start time, or (legacy) date.
 *
 * Notes:
 * - `registration_cutoff` is the primary source of truth when present.
 * - `starts_at` is the fallback when cutoff is null.
 * - `date` is legacy fallback; compare by day to avoid same-day midnight bugs.
 */
export function isEventRegistrationClosed(event: RegistrationCheckInput, now: Date = new Date()): boolean {
  if (event.registration_cutoff) {
    return now > new Date(event.registration_cutoff);
  }
  if (event.starts_at) {
    return now > new Date(event.starts_at);
  }
  if (event.date) {
    // Legacy fallback: compare by local day to avoid same-day appearing closed
    return new Date(event.date) < startOfToday(now);
  }
  return false;
}
