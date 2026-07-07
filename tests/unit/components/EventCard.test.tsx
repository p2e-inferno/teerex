import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EventCard } from '@/components/events/EventCard';
import type { PublishedEvent } from '@/types/event';

const baseEvent: PublishedEvent = {
  id: 'event-1',
  creator_id: 'creator-1',
  title: 'Last man standing',
  description: 'No guts no glory!',
  date: new Date('2026-07-04T00:00:00.000Z'),
  end_date: null,
  starts_at: '2026-07-04T22:00:00.000Z',
  ends_at: '2026-07-04T23:00:00.000Z',
  registration_cutoff: null,
  time: '22:00',
  location: '',
  event_type: 'virtual',
  capacity: 5,
  price: 0,
  currency: 'ETH',
  ngn_price: 0,
  payment_methods: [],
  paystack_public_key: null,
  category: 'Tournament',
  image_url: null,
  lock_address: '0xDC17Bc20d63E3E88cC4B18C9aC7AE3fdc31c0dF1',
  transaction_hash: '0xabc',
  chain_id: 8453,
  created_at: new Date('2026-07-01T00:00:00.000Z'),
  updated_at: new Date('2026-07-01T00:00:00.000Z'),
  attestation_enabled: false,
  attendance_schema_uid: null,
  review_schema_uid: null,
  max_keys_per_address: 1,
  transferable: false,
  requires_approval: false,
  service_manager_added: true,
  is_public: true,
  allow_waitlist: false,
  has_allow_list: false,
  nft_metadata_set: false,
  nft_base_uri: null,
  keys_sold: 4,
};

describe('EventCard', () => {
  it('uses event keys_sold when no explicit keysSold prop is provided', () => {
    render(
      <MemoryRouter>
        <EventCard event={baseEvent} showActions={false} />
      </MemoryRouter>,
    );

    expect(screen.getByText('4/5 registered')).toBeInTheDocument();
    expect(screen.getByText('1 left')).toBeInTheDocument();
  });

  it('prefers explicit keysSold over event keys_sold', () => {
    render(
      <MemoryRouter>
        <EventCard event={baseEvent} keysSold={2} showActions={false} />
      </MemoryRouter>,
    );

    expect(screen.getByText('2/5 registered')).toBeInTheDocument();
    expect(screen.getByText('3 left')).toBeInTheDocument();
  });
});
