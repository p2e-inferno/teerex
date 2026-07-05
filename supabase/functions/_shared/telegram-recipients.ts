/* deno-lint-ignore-file no-explicit-any */
import { type EventManagerPermission, normalizePermissions, normalizeWalletAddress } from "./event-auth.ts";

export type TelegramRecipient = {
  privyUserId: string | null;
  chatId: number;
};

function uniqueRecipients(recipients: TelegramRecipient[]): TelegramRecipient[] {
  const seen = new Set<number>();
  const out: TelegramRecipient[] = [];
  for (const recipient of recipients) {
    if (!Number.isFinite(recipient.chatId) || seen.has(recipient.chatId)) continue;
    seen.add(recipient.chatId);
    out.push(recipient);
  }
  return out;
}

export function excludePrivyUser(recipients: TelegramRecipient[], privyUserId?: string | null): TelegramRecipient[] {
  if (!privyUserId) return recipients;
  return recipients.filter((recipient) => recipient.privyUserId !== privyUserId);
}

export async function getLinkedTelegramRecipientsByPrivyIds(
  supabase: any,
  privyUserIds: Array<string | null | undefined>,
): Promise<TelegramRecipient[]> {
  const ids = Array.from(new Set(privyUserIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("app_user_profiles")
    .select("privy_user_id, telegram_chat_id")
    .in("privy_user_id", ids)
    .eq("telegram_notifications_enabled", true)
    .not("telegram_chat_id", "is", null);

  if (error) throw error;

  return uniqueRecipients((data || []).map((row: any) => ({
    privyUserId: row.privy_user_id,
    chatId: Number(row.telegram_chat_id),
  })));
}

export async function getLinkedTelegramRecipientsByWallets(
  supabase: any,
  wallets: Array<string | null | undefined>,
): Promise<TelegramRecipient[]> {
  const normalized = Array.from(
    new Set(wallets.map((wallet) => normalizeWalletAddress(wallet)).filter((wallet): wallet is string => Boolean(wallet))),
  );
  if (normalized.length === 0) return [];

  const { data, error } = await supabase
    .from("app_user_profiles")
    .select("privy_user_id, telegram_chat_id")
    .overlaps("wallet_addresses", normalized)
    .eq("telegram_notifications_enabled", true)
    .not("telegram_chat_id", "is", null);

  if (error) throw error;

  return uniqueRecipients((data || []).map((row: any) => ({
    privyUserId: row.privy_user_id,
    chatId: Number(row.telegram_chat_id),
  })));
}

export async function getEventOrganizerTelegramRecipients(
  supabase: any,
  event: any,
  permission?: EventManagerPermission,
): Promise<TelegramRecipient[]> {
  const privyIds = new Set<string>();
  const managerWallets: string[] = [];

  if (event?.creator_id) privyIds.add(event.creator_id);

  const { data: managers, error } = await supabase
    .from("event_managers")
    .select("privy_user_id, wallet_address, permissions")
    .eq("event_id", event.id)
    .is("revoked_at", null);

  if (error) throw error;

  for (const manager of managers || []) {
    const permissions = normalizePermissions(manager.permissions);
    if (permission && permissions[permission] !== true) continue;
    if (manager.privy_user_id) privyIds.add(manager.privy_user_id);
    const wallet = normalizeWalletAddress(manager.wallet_address);
    if (wallet) managerWallets.push(wallet);
  }

  return uniqueRecipients([
    ...await getLinkedTelegramRecipientsByPrivyIds(supabase, Array.from(privyIds)),
    ...await getLinkedTelegramRecipientsByWallets(supabase, managerWallets),
  ]);
}

export async function getEventTicketHolderTelegramRecipients(
  supabase: any,
  eventId: string,
  statuses: string[] = ["active"],
): Promise<TelegramRecipient[]> {
  const ticketStatuses = statuses.length > 0 ? statuses : ["active"];
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("owner_wallet")
    .eq("event_id", eventId)
    .in("status", ticketStatuses)
    .not("owner_wallet", "is", null);

  if (error) throw error;
  return getLinkedTelegramRecipientsByWallets(
    supabase,
    (tickets || []).map((ticket: any) => ticket.owner_wallet),
  );
}

export async function getOrganizerSubscriberTelegramRecipients(
  supabase: any,
  organizerPrivyUserId: string,
): Promise<TelegramRecipient[]> {
  const { data: subscriptions, error } = await supabase
    .from("telegram_organizer_subscriptions")
    .select("subscriber_privy_user_id")
    .eq("organizer_privy_user_id", organizerPrivyUserId)
    .is("unsubscribed_at", null);

  if (error) throw error;

  return getLinkedTelegramRecipientsByPrivyIds(
    supabase,
    (subscriptions || []).map((row: any) => row.subscriber_privy_user_id),
  );
}
