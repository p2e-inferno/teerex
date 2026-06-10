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

/**
 * Whether a just-completed cancel/refund should chain into a manager release.
 * Release is only valid once every key is refunded (`refundComplete`), the lock
 * isn't already released, and the connected wallet is the on-chain creator — the
 * only address the controller permits to call `releaseManagerToCreator`.
 * Shared by the event-page hook and the management modal so the rule lives once.
 */
export function shouldAutoReleaseAfterRefund(
  snapshot: { refundComplete: boolean; managerReleased: boolean } | null | undefined,
  signerIsCreator: boolean
): boolean {
  return Boolean(snapshot?.refundComplete && !snapshot.managerReleased && signerIsCreator);
}

export const RELEASE_AFTER_REFUND_PROMPT = {
  title: 'Refunds complete',
  description: 'Confirm one more transaction to release the event back to your wallet.',
} as const;

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
