export type RefundProtectionBadgeAudience = 'public' | 'creator';

const MISSED_THRESHOLD_STATUSES = new Set([
  'refund_available',
  'creator_only_refund_window',
]);

const CANCELLED_STATUSES = new Set([
  'refund_in_progress',
  'refunded',
]);

const SUCCESS_STATUSES = new Set([
  'threshold_met',
  'released',
]);

export function getRefundProtectionBadge(
  status?: string | null,
  audience: RefundProtectionBadgeAudience = 'public'
): {
  label: string;
  className: string;
} {
  if (MISSED_THRESHOLD_STATUSES.has(status || '')) {
    return {
      label: 'Threshold Missed',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (CANCELLED_STATUSES.has(status || '')) {
    return {
      label: 'Cancelled',
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  if (status === 'threshold_met' || status === 'released') {
    return {
      label: audience === 'creator'
        ? (status === 'released' ? 'Manager Released' : 'Threshold Met')
        : 'Successful',
      className: audience === 'creator'
        ? (status === 'released'
            ? 'border-slate-200 bg-slate-50 text-slate-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700')
        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  return {
    label: 'Protected',
    className: 'border-purple-200 bg-purple-50 text-purple-700',
  };
}

export function getRefundProtectionPurchaseStateLabel(status?: string | null): string {
  if (MISSED_THRESHOLD_STATUSES.has(status || '')) {
    return 'Threshold Missed';
  }

  if (CANCELLED_STATUSES.has(status || '')) {
    return 'Cancelled';
  }

  if (SUCCESS_STATUSES.has(status || '')) {
    return 'Event Successful';
  }

  return 'Awaiting Resolution';
}
