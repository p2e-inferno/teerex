import { describe, expect, it } from 'vitest';
import { formatEventLocalTimeRange, isUpcomingEvent, resolveEventStart } from '@/utils/eventTime';

const utc24h: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
};

describe('event time formatting', () => {
  it('formats same-day events as a start and end time range', () => {
    expect(
      formatEventLocalTimeRange(
        '2026-06-20T22:20:00.000Z',
        '2026-06-20T23:45:00.000Z',
        '22:20',
        utc24h
      )
    ).toBe('22:20 - 23:45');
  });

  it('includes the end date for multi-day event time ranges', () => {
    expect(
      formatEventLocalTimeRange(
        '2026-06-20T22:20:00.000Z',
        '2026-06-21T13:30:00.000Z',
        '22:20',
        utc24h
      )
    ).toBe('22:20 - 21 June, 13:30');
  });

  it('falls back to the legacy start time when an end timestamp is unavailable', () => {
    expect(formatEventLocalTimeRange(null, null, '22:20', utc24h)).toBe('22:20');
  });
});

describe('event start resolution', () => {
  const now = new Date(2026, 6, 15, 12, 0, 0);

  it('uses the precise start timestamp when available', () => {
    const startsAt = new Date(2026, 6, 15, 18, 0, 0).toISOString();
    const resolved = resolveEventStart({ starts_at: startsAt, date: new Date(2026, 6, 14) });

    expect(resolved).toEqual({ value: new Date(startsAt), precision: 'timestamp' });
    expect(isUpcomingEvent({ starts_at: startsAt, date: new Date(2026, 6, 14) }, now)).toBe(true);
  });

  it('keeps same-day legacy events upcoming for the full day', () => {
    expect(isUpcomingEvent({ starts_at: null, date: new Date(2026, 6, 15) }, now)).toBe(true);
  });

  it('rejects past and invalid event starts', () => {
    expect(isUpcomingEvent({ starts_at: new Date(2026, 6, 15, 10).toISOString(), date: null }, now)).toBe(false);
    expect(isUpcomingEvent({ starts_at: 'invalid', date: null }, now)).toBe(false);
  });
});
