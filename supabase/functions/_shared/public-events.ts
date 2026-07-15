/* deno-lint-ignore-file no-explicit-any */

export const PUBLIC_EVENT_SELECT = [
  "id",
  "creator_address",
  "title",
  "description",
  "date",
  "end_date",
  "starts_at",
  "ends_at",
  "registration_cutoff",
  "time",
  "location",
  "event_type",
  "capacity",
  "price",
  "currency",
  "ngn_price",
  "ngn_price_kobo",
  "payment_methods",
  "paystack_public_key",
  "category",
  "image_url",
  "image_crop_x",
  "image_crop_y",
  "lock_address",
  "transaction_hash",
  "chain_id",
  "created_at",
  "updated_at",
  "attestation_enabled",
  "attendance_schema_uid",
  "review_schema_uid",
  "max_keys_per_address",
  "transferable",
  "requires_approval",
  "service_manager_added",
  "is_public",
  "allow_waitlist",
  "has_allow_list",
  "nft_metadata_set",
  "nft_base_uri",
  "refund_protection_enabled",
  "refund_min_attendees",
  "refund_trigger_at",
  "refund_event_end_at",
  "refund_controller_address",
  "refund_reserve_bond",
  "refund_status",
  "refund_manager_released",
  "refund_manager_released_at",
  "refund_last_tx_hash",
  "refund_last_synced_at",
  "game_id",
].join(", ");

export interface PublicEventStats {
  events_count: number;
  tickets_sold: number;
  creator_count: number;
  chains_count: number;
}

export function applyPublicEventSort(query: any, sort: string) {
  switch (sort) {
    case "newest":
      return query.order("created_at", { ascending: false });
    case "price-asc":
      return query.order("price", { ascending: true });
    case "price-desc":
      return query.order("price", { ascending: false });
    case "upcoming":
      return query
        .order("starts_at", { ascending: true, nullsFirst: false })
        .order("date", { ascending: true, nullsFirst: false });
    case "date-desc":
    default:
      return query
        .order("date", { ascending: false, nullsFirst: false })
        .order("starts_at", { ascending: false, nullsFirst: false });
  }
}

export async function loadPublicEventStats(supabase: any): Promise<PublicEventStats> {
  const [{ data: eventRows, error: eventsError }, { count: ticketCount, error: ticketsError }] = await Promise.all([
    supabase.from("events").select("creator_id, chain_id").eq("is_public", true),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  if (eventsError) throw eventsError;
  if (ticketsError) throw ticketsError;

  const rows = eventRows ?? [];
  return {
    events_count: rows.length,
    tickets_sold: ticketCount ?? 0,
    creator_count: new Set(rows.map((row: any) => row.creator_id).filter(Boolean)).size,
    chains_count: new Set(rows.map((row: any) => row.chain_id).filter((value: unknown) => value != null)).size,
  };
}
