import { describe, expect, it } from 'vitest';
import { formatEventLocalTimeRange } from '@/utils/eventTime';

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
