import { describe, expect, it } from 'vitest';
import { selectFeaturedEvents, selectUpcomingEvents } from '@/lib/home/homeData';
import type { PublishedEvent } from '@/types/event';

const event = (id: string, values: Partial<PublishedEvent>): PublishedEvent => ({
  id,
  title: id,
  starts_at: null,
  date: null,
  image_url: null,
  ...values,
} as PublishedEvent);

describe('home event selection', () => {
  const now = new Date(2026, 6, 15, 12, 0, 0);

  it('uses starts_at to include and order events later today', () => {
    const later = event('later', { starts_at: new Date(2026, 6, 15, 20).toISOString() });
    const sooner = event('sooner', { starts_at: new Date(2026, 6, 15, 14).toISOString() });
    const past = event('past', { starts_at: new Date(2026, 6, 15, 10).toISOString() });

    expect(selectUpcomingEvents([later, past, sooner], 3, now).map(({ id }) => id)).toEqual(['sooner', 'later']);
  });

  it('includes a same-day legacy event and excludes an earlier day', () => {
    const today = event('today', { date: new Date(2026, 6, 15) });
    const yesterday = event('yesterday', { date: new Date(2026, 6, 14) });

    expect(selectUpcomingEvents([yesterday, today], 3, now).map(({ id }) => id)).toEqual(['today']);
  });

  it('prioritizes upcoming featured events with images before recent past events', () => {
    const upcoming = event('upcoming', {
      starts_at: new Date(2026, 6, 16, 10).toISOString(),
      image_url: 'upcoming.png',
    });
    const past = event('past', {
      starts_at: new Date(2026, 6, 14, 10).toISOString(),
      image_url: 'past.png',
    });
    const noImage = event('no-image', { starts_at: new Date(2026, 6, 17, 10).toISOString() });

    expect(selectFeaturedEvents([past, noImage, upcoming], 3, now).map(({ id }) => id)).toEqual(['upcoming', 'past']);
  });
});
