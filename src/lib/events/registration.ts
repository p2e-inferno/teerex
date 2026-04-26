import type { PublishedEvent } from '@/types/event';

type RegistrationCheckInput = Pick<PublishedEvent, 'registration_cutoff' | 'starts_at' | 'date'>;
export type RegistrationStatusReason = 'open' | 'cutoff_passed' | 'event_started' | 'legacy_date_passed';

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
  return getEventRegistrationStatus(event, now).isClosed;
}

export function getEventRegistrationStatus(
  event: RegistrationCheckInput,
  now: Date = new Date()
): { isClosed: boolean; reason: RegistrationStatusReason } {
  if (event.registration_cutoff) {
    const cutoffPassed = now > new Date(event.registration_cutoff);
    if (!cutoffPassed) {
      return { isClosed: false, reason: 'open' };
    }
    if (event.starts_at && now >= new Date(event.starts_at)) {
      return { isClosed: true, reason: 'event_started' };
    }
    return { isClosed: true, reason: 'cutoff_passed' };
  }
  if (event.starts_at) {
    return now > new Date(event.starts_at)
      ? { isClosed: true, reason: 'event_started' }
      : { isClosed: false, reason: 'open' };
  }
  if (event.date) {
    // Legacy fallback: compare by local day to avoid same-day appearing closed
    return new Date(event.date) < startOfToday(now)
      ? { isClosed: true, reason: 'legacy_date_passed' }
      : { isClosed: false, reason: 'open' };
  }
  return { isClosed: false, reason: 'open' };
}
