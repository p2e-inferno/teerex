import type { PublishedEvent } from '@/types/event';
import { resolveEventStart } from '@/utils/eventTime';

type RegistrationCheckInput = Pick<PublishedEvent, 'registration_cutoff' | 'starts_at' | 'date'>;
export type RegistrationStatusReason = 'open' | 'cutoff_passed' | 'event_started' | 'legacy_date_passed';

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
  const start = resolveEventStart(event);
  if (start?.precision === 'timestamp') {
    return now > start.value
      ? { isClosed: true, reason: 'event_started' }
      : { isClosed: false, reason: 'open' };
  }
  if (start) {
    const eventDay = new Date(start.value.getFullYear(), start.value.getMonth(), start.value.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return eventDay < today
      ? { isClosed: true, reason: 'legacy_date_passed' }
      : { isClosed: false, reason: 'open' };
  }
  return { isClosed: false, reason: 'open' };
}
