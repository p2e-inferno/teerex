/* deno-lint-ignore-file no-explicit-any */

export const LINKABLE_EVENT_FIELDS = "id,title,lock_address,chain_id,date,location,image_url";

export type LinkableEvent = {
  id: string;
  title: string;
  lock_address: string;
  chain_id: number;
  date?: string | null;
  location?: string | null;
  image_url?: string | null;
};

export type LinkableEventResolveResult =
  | { ok: true; event: LinkableEvent }
  | { ok: false; error: "linked_event_not_found" | "linked_event_chain_mismatch" };

export const isEventLockAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

export async function resolveLinkableEventByAddress(
  supabase: any,
  address: string,
  options: { chainId?: number } = {},
): Promise<LinkableEventResolveResult> {
  const normalizedAddress = address.trim().toLowerCase();
  const { data: event, error } = await supabase
    .from("events")
    .select(LINKABLE_EVENT_FIELDS)
    .eq("is_public", true)
    .ilike("lock_address", normalizedAddress)
    .maybeSingle();

  if (error) throw error;
  if (!event) return { ok: false, error: "linked_event_not_found" };
  if (options.chainId !== undefined && Number(event.chain_id) !== options.chainId) {
    return { ok: false, error: "linked_event_chain_mismatch" };
  }

  return { ok: true, event };
}
