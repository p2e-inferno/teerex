import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedEvent } from '@/types/event';

const mocks = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    channel,
    channelFactory: vi.fn(() => channel),
    fetchKeysSoldForEvents: vi.fn(),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: mocks.channelFactory },
}));

vi.mock('@/lib/home/homeData', () => ({
  fetchKeysSoldForEvents: mocks.fetchKeysSoldForEvents,
}));

import { useMultiEventTicketRealtime } from '@/hooks/useMultiEventTicketRealtime';

const event = {
  id: 'event-1',
  lock_address: '0x0000000000000000000000000000000000000001',
  chain_id: 8453,
} as PublishedEvent;

describe('useMultiEventTicketRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.fetchKeysSoldForEvents.mockResolvedValue({ 'event-1': 4 });
  });

  it('fetches current on-chain counts for initial and manual refreshes', async () => {
    const events = [event];
    const { result } = renderHook(() => useMultiEventTicketRealtime(events));

    await waitFor(() => expect(result.current.keysSoldMap['event-1']).toBe(4));
    mocks.fetchKeysSoldForEvents.mockResolvedValueOnce({ 'event-1': 5 });

    await act(async () => {
      await result.current.refreshAllTicketCounts();
    });

    expect(result.current.keysSoldMap['event-1']).toBe(5);
  });

  it('refreshes all visible events when a deleted row contains only its primary key', async () => {
    const events = [event];
    const { result } = renderHook(() => useMultiEventTicketRealtime(events));
    await waitFor(() => expect(mocks.channel.on).toHaveBeenCalled());

    const handler = mocks.channel.on.mock.calls[0][2] as (payload: unknown) => void;
    mocks.fetchKeysSoldForEvents.mockResolvedValueOnce({ 'event-1': 3 });

    act(() => {
      handler({ eventType: 'DELETE', new: {}, old: { id: 'ticket-1' } });
    });

    await waitFor(() => expect(result.current.keysSoldMap['event-1']).toBe(3));
    expect(mocks.fetchKeysSoldForEvents).toHaveBeenLastCalledWith(events);
  });
});
