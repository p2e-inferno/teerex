import type { PublishedEvent } from '@/types/event';

export type MappedEvent = PublishedEvent & {
  isHidden: boolean;
  isAllowList: boolean;
};

export const mapEventRow = (event: any): MappedEvent => {
  const { purchase_confirmation_message: _purchaseConfirmationMessage, ...publicEvent } = event;

  return {
    ...publicEvent,
    date: event.date ? new Date(event.date) : null,
    end_date: event.end_date ? new Date(event.end_date) : null,
    created_at: new Date(event.created_at),
    updated_at: new Date(event.updated_at),
    starts_at: event.starts_at || null,
    ends_at: event.ends_at || null,
    registration_cutoff: event.registration_cutoff || null,
    currency: event.currency,
    ngn_price: event.ngn_price || 0,
    ngn_price_kobo: event.ngn_price_kobo || 0,
    payment_methods: event.payment_methods || [],
    paystack_public_key: event.paystack_public_key,
    refund_protection_enabled: event.refund_protection_enabled ?? false,
    refund_min_attendees: event.refund_min_attendees ?? null,
    refund_trigger_at: event.refund_trigger_at ?? null,
    refund_event_end_at: event.refund_event_end_at ?? null,
    refund_controller_address: event.refund_controller_address ?? null,
    refund_reserve_bond: event.refund_reserve_bond ?? null,
    refund_status: event.refund_status ?? null,
    refund_manager_released: event.refund_manager_released ?? (event.refund_status === 'released'),
    refund_manager_released_at: event.refund_manager_released_at ?? null,
    refund_last_tx_hash: event.refund_last_tx_hash ?? null,
    refund_last_synced_at: event.refund_last_synced_at ?? null,
    isHidden: event.is_public === false,
    isAllowList: !!event.has_allow_list,
  };
};
