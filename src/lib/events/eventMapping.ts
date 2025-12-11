import type { PublishedEvent } from '@/types/event';

export type MappedEvent = PublishedEvent & {
  isHidden: boolean;
  isAllowList: boolean;
};

export const mapEventRow = (event: any): MappedEvent => ({
  ...event,
  date: event.date ? new Date(event.date) : null,
  end_date: event.end_date ? new Date(event.end_date) : null,
  created_at: new Date(event.created_at),
  updated_at: new Date(event.updated_at),
  starts_at: event.starts_at || null,
  currency: event.currency as 'ETH' | 'USDC' | 'FREE',
  ngn_price: event.ngn_price || 0,
  payment_methods: event.payment_methods || ['crypto'],
  paystack_public_key: event.paystack_public_key,
  isHidden: event.is_public === false,
  isAllowList: !!event.has_allow_list,
});
