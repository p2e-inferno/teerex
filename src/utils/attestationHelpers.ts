import type { AttestationKind, SchemaInfo, InstanceInfo, UiFlags } from '@/types/attestations';

export const isValidSchemaUid = (uid?: string | null) => !!uid && uid.startsWith('0x') && uid.length === 66 && /^0x[0-9a-f]{64}$/i.test(uid);

export function deriveUiFlags(kind: AttestationKind, schema: SchemaInfo, instance: InstanceInfo, busy: boolean): UiFlags {
  if (busy) return { canRevoke: false, reason: 'busy' };
  if (!isValidSchemaUid(schema.uid)) return { canRevoke: false, reason: 'schema-invalid' };
  if (!instance.uid) return { canRevoke: false, reason: 'missing-uid' };
  // Schema-level non-revocable
  if (schema.revocable === false) {
    return { canRevoke: false, reason: kind === 'attendance' ? 'permanent' : 'instance-nonrevocable' };
  }
  // Instance-level non-revocable
  if (instance.revocable === false) return { canRevoke: false, reason: 'instance-nonrevocable' };
  return { canRevoke: true };
}

