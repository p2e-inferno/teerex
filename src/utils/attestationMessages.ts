import type { AttestationKind, DisableReason } from '@/types/attestations';

export function getDisableMessage(kind: AttestationKind, reason?: DisableReason): string | undefined {
  if (!reason) return undefined;
  switch (reason) {
    case 'busy':
      return 'Processing…';
    case 'schema-invalid':
      return kind === 'attendance'
        ? 'Attendance unavailable: schema not configured or invalid.'
        : kind === 'going'
          ? 'Going unavailable: schema not configured or invalid.'
          : 'Likes unavailable: schema not configured or invalid.';
    case 'missing-uid':
      return 'Revoke unavailable: record not found.';
    case 'permanent':
      return 'Attendance records for this event are permanent.';
    case 'instance-nonrevocable':
      return kind === 'like'
        ? 'Removing your like isn’t available for this event.'
        : kind === 'going'
          ? 'This going status can’t be revoked.'
          : 'This attestation can’t be revoked.';
    default:
      return undefined;
  }
}

