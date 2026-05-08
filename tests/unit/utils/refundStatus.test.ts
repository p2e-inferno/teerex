import { describe, expect, it } from 'vitest';
import {
  getRefundProtectionBadge,
  getRefundProtectionPurchaseStateLabel,
} from '@/lib/events/refundStatus';

describe('refundStatus badge labels', () => {
  it('shows a public success label for threshold met and released states', () => {
    expect(getRefundProtectionBadge('threshold_met').label).toBe('Successful');
    expect(getRefundProtectionBadge('released').label).toBe('Successful');
  });

  it('shows creator-only release wording for released events', () => {
    expect(getRefundProtectionBadge('released', 'creator').label).toBe('Manager Released');
    expect(getRefundProtectionBadge('threshold_met', 'creator').label).toBe('Threshold Met');
  });

  it('shows threshold missed for refund-available states', () => {
    expect(getRefundProtectionBadge('refund_available').label).toBe('Threshold Missed');
    expect(getRefundProtectionBadge('creator_only_refund_window').label).toBe('Threshold Missed');
  });

  it('shows cancelled for refund completion states', () => {
    expect(getRefundProtectionBadge('refund_in_progress').label).toBe('Cancelled');
    expect(getRefundProtectionBadge('refunded').label).toBe('Cancelled');
  });
});

describe('refundStatus purchase labels', () => {
  it('maps public ticket actions to clearer protection states', () => {
    expect(getRefundProtectionPurchaseStateLabel('threshold_met')).toBe('Event Successful');
    expect(getRefundProtectionPurchaseStateLabel('released')).toBe('Event Successful');
    expect(getRefundProtectionPurchaseStateLabel('refund_available')).toBe('Threshold Missed');
    expect(getRefundProtectionPurchaseStateLabel('refund_in_progress')).toBe('Cancelled');
  });
});
