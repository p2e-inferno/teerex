import { useEffect, useMemo, useState } from 'react';
import type { EventAttestationState, SchemaInfo, InstanceInfo } from '@/types/attestations';
import { getSchemaByName, getFirstAttendanceSchema, getAttendanceSchemaForEvent, getLatestUserUid } from '@/integrations/supabase/attestations';
import { isAttestationRevocableOnChain } from '@/utils/attestationUtils';
import { deriveUiFlags } from '@/utils/attestationHelpers';

interface Params {
  eventId: string;
  chainId: number;
  lockAddress: string;
  userAddress?: string;
  preferredAttendanceSchemaUid?: string | null;
}

export function useEventAttestationState(params: Params) {
  const { eventId, chainId, userAddress, preferredAttendanceSchemaUid } = params;

  // Schema state
  const [attendanceSchema, setAttendanceSchema] = useState<SchemaInfo>({ uid: null, revocable: null });
  const [likeSchema, setLikeSchema] = useState<SchemaInfo>({ uid: null, revocable: null });
  const [goingSchema, setGoingSchema] = useState<SchemaInfo>({ uid: null, revocable: null });

  // Instance state
  const [attendanceInstance, setAttendanceInstance] = useState<InstanceInfo>({ uid: null, revocable: null });
  const [likeInstance, setLikeInstance] = useState<InstanceInfo>({ uid: null, revocable: null });
  const [goingInstance, setGoingInstance] = useState<InstanceInfo>({ uid: null, revocable: null });

  // Busy flags for targeted UI disables
  const [busy, setBusy] = useState<{ like?: boolean; going?: boolean; attendance?: boolean }>({});

  // Effect A: DB schemas (independent)
  useEffect(() => {
    const abort = { cancelled: false } as { cancelled: boolean };
    const run = async () => {
      try {
        // Attendance
        let att = { uid: preferredAttendanceSchemaUid ?? null, revocable: null as boolean | null };
        if (att.uid) {
          const fromEvent = await getAttendanceSchemaForEvent(eventId);
          att = fromEvent.uid ? fromEvent : att;
        } else {
          const first = await getFirstAttendanceSchema();
          att = first;
        }
        // Like & Going by name
        const like = await getSchemaByName('TeeRex EventLike');
        const going = await getSchemaByName('TeeRex EventGoing');
        if (!abort.cancelled) {
          setAttendanceSchema(att);
          setLikeSchema(like);
          setGoingSchema(going);
        }
      } catch (_) {
        if (!abort.cancelled) {
          setAttendanceSchema({ uid: null, revocable: null });
          setLikeSchema({ uid: null, revocable: null });
          setGoingSchema({ uid: null, revocable: null });
        }
      }
    };
    run();
    return () => { abort.cancelled = true; };
  }, [eventId, preferredAttendanceSchemaUid]);

  // Effect B: DB user UIDs (depends on schemas + userAddress)
  useEffect(() => {
    const abort = { cancelled: false } as { cancelled: boolean };
    const run = async () => {
      try {
        if (!userAddress) {
          if (!abort.cancelled) {
            setAttendanceInstance({ uid: null, revocable: null });
            setLikeInstance({ uid: null, revocable: null });
            setGoingInstance({ uid: null, revocable: null });
          }
          return;
        }
        const [attUid, likeUid, goingUid] = await Promise.all([
          attendanceSchema.uid ? getLatestUserUid(eventId, attendanceSchema.uid, userAddress) : Promise.resolve(null),
          likeSchema.uid ? getLatestUserUid(eventId, likeSchema.uid, userAddress) : Promise.resolve(null),
          goingSchema.uid ? getLatestUserUid(eventId, goingSchema.uid, userAddress) : Promise.resolve(null),
        ]);
        if (!abort.cancelled) {
          setAttendanceInstance((p) => ({ ...p, uid: attUid }));
          setLikeInstance((p) => ({ ...p, uid: likeUid }));
          setGoingInstance((p) => ({ ...p, uid: goingUid }));
        }
      } catch (_) {
        if (!abort.cancelled) {
          setAttendanceInstance((p) => ({ ...p, uid: null }));
          setLikeInstance((p) => ({ ...p, uid: null }));
          setGoingInstance((p) => ({ ...p, uid: null }));
        }
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, userAddress, attendanceSchema.uid, likeSchema.uid, goingSchema.uid]);

  // Effect C: On-chain instance revocable (depends on instance UIDs)
  useEffect(() => {
    const abort = { cancelled: false } as { cancelled: boolean };
    const run = async () => {
      try {
        const [attR, likeR, goingR] = await Promise.all([
          attendanceInstance.uid ? isAttestationRevocableOnChain(attendanceInstance.uid, chainId) : Promise.resolve(null),
          likeInstance.uid ? isAttestationRevocableOnChain(likeInstance.uid, chainId) : Promise.resolve(null),
          goingInstance.uid ? isAttestationRevocableOnChain(goingInstance.uid, chainId) : Promise.resolve(null),
        ]);
        if (!abort.cancelled) {
          setAttendanceInstance((p) => ({ ...p, revocable: attR }));
          setLikeInstance((p) => ({ ...p, revocable: likeR }));
          setGoingInstance((p) => ({ ...p, revocable: goingR }));
        }
      } catch (_) {
        if (!abort.cancelled) {
          setAttendanceInstance((p) => ({ ...p, revocable: null }));
          setLikeInstance((p) => ({ ...p, revocable: null }));
          setGoingInstance((p) => ({ ...p, revocable: null }));
        }
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceInstance.uid, likeInstance.uid, goingInstance.uid, chainId]);

  // Derived UI flags
  const state: EventAttestationState = useMemo(() => {
    return {
      like: {
        schema: likeSchema,
        instance: likeInstance,
        flags: deriveUiFlags('like', likeSchema, likeInstance, Boolean(busy.like)),
      },
      going: {
        schema: goingSchema,
        instance: goingInstance,
        flags: deriveUiFlags('going', goingSchema, goingInstance, Boolean(busy.going)),
      },
      attendance: {
        schema: attendanceSchema,
        instance: attendanceInstance,
        flags: deriveUiFlags('attendance', attendanceSchema, attendanceInstance, Boolean(busy.attendance)),
      },
    };
  }, [likeSchema, likeInstance, goingSchema, goingInstance, attendanceSchema, attendanceInstance, busy]);

  return {
    state,
    setBusy,
  } as const;
}
