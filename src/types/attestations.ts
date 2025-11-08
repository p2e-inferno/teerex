export type AttestationKind = 'like' | 'going' | 'attendance';

export interface SchemaInfo {
  uid: string | null;
  revocable: boolean | null;
}

export interface InstanceInfo {
  uid: string | null;
  revocable: boolean | null;
}

export type DisableReason =
  | 'busy'
  | 'schema-invalid'
  | 'missing-uid'
  | 'permanent' // attendance permanent
  | 'instance-nonrevocable';

export interface UiFlags {
  canRevoke: boolean;
  reason?: DisableReason;
}

export interface AttestationStateByKind {
  schema: SchemaInfo;
  instance: InstanceInfo;
  flags: UiFlags;
}

export interface EventAttestationState {
  like: AttestationStateByKind;
  going: AttestationStateByKind;
  attendance: AttestationStateByKind;
}

