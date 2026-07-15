import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { fetchPublicEvents } from '@/lib/events/publicEvents';

vi.mock('@/lib/edgeFunctions', () => ({ callEdgeFunction: vi.fn() }));

describe('public event discovery client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the shared public endpoint and maps its response', async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({
      events: [{
        id: 'event-1',
        date: '2026-07-15T00:00:00.000Z',
        starts_at: '2026-07-15T18:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      }],
      total_count: 1,
      has_more: false,
      stats: { events_count: 4, tickets_sold: 7, creator_count: 2, chains_count: 1 },
    });

    const result = await fetchPublicEvents({
      sort: 'upcoming',
      upcomingOnly: true,
      limit: 3,
      includeStats: true,
    });

    expect(callEdgeFunction).toHaveBeenCalledWith('public-events', {
      sort: 'upcoming',
      upcoming_only: true,
      limit: 3,
      include_stats: true,
    }, {});
    expect(result.events[0].date).toEqual(new Date('2026-07-15T00:00:00.000Z'));
    expect(result.stats).toEqual({ eventsCount: 4, ticketsSold: 7, creatorCount: 2, chainsCount: 1 });
  });
});
