import type { PublishedEvent } from '@/types/event';

export type PaymentMethod = 'free' | 'crypto' | 'fiat';

type HasPaymentMethods = Pick<PublishedEvent, 'payment_methods'>;

export const hasMethod = (event: HasPaymentMethods | null | undefined, method: PaymentMethod) =>
  Boolean(event?.payment_methods?.includes(method));

export const isFreeEvent = (event: HasPaymentMethods | null | undefined) => hasMethod(event, 'free');
export const hasCrypto = (event: HasPaymentMethods | null | undefined) => hasMethod(event, 'crypto');
export const hasFiat = (event: HasPaymentMethods | null | undefined) => hasMethod(event, 'fiat');

