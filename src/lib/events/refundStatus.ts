const MISSED_THRESHOLD_STATUSES = new Set([
  'refund_available',
  'creator_only_refund_window',
]);

const CANCELLED_STATUSES = new Set([
  'refund_in_progress',
  'refunded',
]);

export function getRefundProtectionBadge(status?: string | null): {
  label: string;
  className: string;
} {
  if (MISSED_THRESHOLD_STATUSES.has(status || '')) {
    return {
      label: 'Threshold missed',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (CANCELLED_STATUSES.has(status || '')) {
    return {
      label: 'Cancelled',
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  if (status === 'threshold_met') {
    return {
      label: 'Threshold met',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (status === 'released') {
    return {
      label: 'Released',
      className: 'border-green-200 bg-green-50 text-green-700',
    };
  }

  return {
    label: 'Protected',
    className: 'border-purple-200 bg-purple-50 text-purple-700',
  };
}
