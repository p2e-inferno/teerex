import { describe, expect, it } from 'vitest';
import { getEventRegistrationStatus } from '@/lib/events/registration';
import type { PublishedEvent } from '@/types/event';

const event = (values: Partial<PublishedEvent>) => values as PublishedEvent;

describe('event registration timing', () => {
  const now = new Date(2026, 6, 15, 12, 0, 0);

  it('uses starts_at as the precise fallback when no cutoff exists', () => {
    expect(getEventRegistrationStatus(event({
      registration_cutoff: null,
      starts_at: new Date(2026, 6, 15, 18).toISOString(),
      date: new Date(2026, 6, 15),
    }), now)).toEqual({ isClosed: false, reason: 'open' });
  });

  it('keeps a legacy same-day event open', () => {
    expect(getEventRegistrationStatus(event({
      registration_cutoff: null,
      starts_at: null,
      date: new Date(2026, 6, 15),
    }), now)).toEqual({ isClosed: false, reason: 'open' });
  });
});
