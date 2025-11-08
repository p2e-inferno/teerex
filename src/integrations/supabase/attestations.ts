import { supabase } from '@/integrations/supabase/client';

export async function getSchemaByName(name: string): Promise<{ uid: string | null; revocable: boolean | null }> {
  const { data } = await supabase
    .from('attestation_schemas')
    .select('schema_uid, revocable')
    .eq('name', name)
    .maybeSingle();
  return { uid: data?.schema_uid ?? null, revocable: data?.revocable ?? null };
}

export async function getFirstAttendanceSchema(): Promise<{ uid: string | null; revocable: boolean | null }> {
  const { data } = await supabase
    .from('attestation_schemas')
    .select('schema_uid, revocable, category, created_at')
    .eq('category', 'attendance')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { uid: data?.schema_uid ?? null, revocable: data?.revocable ?? null };
}

export async function getAttendanceSchemaForEvent(eventId: string): Promise<{ uid: string | null; revocable: boolean | null }> {
  const { data: ev } = await supabase
    .from('events')
    .select('attendance_schema_uid')
    .eq('id', eventId)
    .maybeSingle();
  const uid = ev?.attendance_schema_uid ?? null;
  if (!uid) return { uid: null, revocable: null };
  const { data } = await supabase
    .from('attestation_schemas')
    .select('schema_uid, revocable')
    .eq('schema_uid', uid)
    .maybeSingle();
  return { uid: data?.schema_uid ?? uid, revocable: data?.revocable ?? null };
}

export async function getLatestUserUid(eventId: string, schemaUid: string, userAddress: string): Promise<string | null> {
  if (!schemaUid || !userAddress) return null;
  const { data } = await supabase
    .from('attestations')
    .select('attestation_uid, created_at')
    .eq('event_id', eventId)
    .eq('schema_uid', schemaUid)
    .eq('recipient', userAddress)
    .eq('is_revoked', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.attestation_uid ?? null;
}

