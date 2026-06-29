export type RefundProtectionBadgeAudience = 'public' | 'creator';

export interface RefundProtectionBadge {
  label: string;
  className: string;
}

export type RewardPoolCreationGateKind =
  | 'ready'
  | 'release_required'
  | 'refund_required'
  | 'pending_resolution';

export interface RewardPoolCreationGate {
  kind: RewardPoolCreationGateKind;
  buttonLabel: string;
  helperText: string | null;
  disabled: boolean;
}

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
]);

export function getRefundProtectionBadge(
  status?: string | null,
  audience: RefundProtectionBadgeAudience = 'public'
): RefundProtectionBadge {
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

  if (status === 'threshold_met') {
    return {
      label: audience === 'creator' ? 'Threshold Met' : 'Successful',
      className: audience === 'creator'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (status === 'released') {
    return getRefundProtectionReleaseBadge(true, audience)!;
  }

  return {
    label: 'Protected',
    className: 'border-purple-200 bg-purple-50 text-purple-700',
  };
}

export function getRefundProtectionReleaseBadge(
  managerReleased?: boolean | null,
  audience: RefundProtectionBadgeAudience = 'public'
): RefundProtectionBadge | null {
  if (!managerReleased) return null;

  return {
    label: audience === 'creator' ? 'Manager Released' : 'Protection Released',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  };
}

export function getRefundProtectionBadges(
  status?: string | null,
  audience: RefundProtectionBadgeAudience = 'public',
  managerReleased?: boolean | null
): RefundProtectionBadge[] {
  const badges: RefundProtectionBadge[] = [];

  if (status !== 'released') {
    badges.push(getRefundProtectionBadge(status, audience));
  }

  const releaseBadge = getRefundProtectionReleaseBadge(
    Boolean(managerReleased || status === 'released'),
    audience
  );
  if (releaseBadge) {
    badges.push(releaseBadge);
  }

  return badges;
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

  if (status === 'released') {
    return 'Protection Released';
  }

  if (SUCCESS_STATUSES.has(status || '')) {
    return 'Event Successful';
  }

  return 'Awaiting Resolution';
}

export function getRewardPoolCreationGate({
  isProtectedEvent,
  status,
  refundComplete,
  managerReleased,
  signerIsCreator,
  authorizedRefundCaller,
  signerMatchesAuthorizedRefundCaller,
}: {
  isProtectedEvent: boolean;
  status?: string | null;
  refundComplete?: boolean | null;
  managerReleased?: boolean | null;
  signerIsCreator?: boolean;
  authorizedRefundCaller?: boolean;
  signerMatchesAuthorizedRefundCaller?: boolean;
}): RewardPoolCreationGate {
  if (!isProtectedEvent || managerReleased || status === 'released') {
    return {
      kind: 'ready',
      buttonLabel: 'Create prize pool',
      helperText: null,
      disabled: false,
    };
  }

  if (refundComplete || status === 'refunded' || status === 'threshold_met') {
    return {
      kind: 'release_required',
      buttonLabel: 'Release protection to create prize pool',
      helperText: signerIsCreator
        ? 'The attendance controller is still managing this event. Release it back to your wallet before funding prizes.'
        : 'Switch to the event creator wallet to release this event before funding prizes.',
      disabled: !signerIsCreator,
    };
  }

  if (MISSED_THRESHOLD_STATUSES.has(status || '') || status === 'refund_in_progress') {
    return {
      kind: 'refund_required',
      buttonLabel: status === 'refund_in_progress' ? 'Continue refunds' : 'Cancel and refund tickets',
      helperText: signerMatchesAuthorizedRefundCaller
        ? 'This protected event missed its attendance threshold. Resolve refunds before creating a prize pool.'
        : 'Switch to the authorized refund wallet to resolve refunds before creating a prize pool.',
      disabled: !authorizedRefundCaller || !signerMatchesAuthorizedRefundCaller,
    };
  }

  return {
    kind: 'pending_resolution',
    buttonLabel: 'Protection pending',
    helperText: 'Prize pools unlock after attendance protection resolves.',
    disabled: true,
  };
}
