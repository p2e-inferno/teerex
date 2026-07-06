/* deno-lint-ignore-file no-explicit-any */
import { buildTelegramMessage, sendTelegramMessage } from "./telegram.ts";
import {
  excludePrivyUser,
  getEventOrganizerTelegramRecipients,
  getEventTicketHolderTelegramRecipients,
  getOrganizerSubscriberTelegramRecipients,
  type TelegramRecipient,
} from "./telegram-recipients.ts";

const APP_URL = Deno.env.get("VITE_TEEREX_DOMAIN") || "https://teerex.live";
const BATCH_SIZE = Number(Deno.env.get("TELEGRAM_NOTIFICATION_BATCH_SIZE") || "25");
const SEND_DELAY_MS = Number(Deno.env.get("TELEGRAM_NOTIFICATION_DELAY_MS") || "1000");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type TelegramDispatchResult = {
  sent: number;
  failed: number;
  skipped: number;
  total: number;
};

function eventUrl(event: any, suffix = ""): string {
  const slug = event?.lock_address ? String(event.lock_address).toLowerCase() : String(event?.id || "");
  return `${APP_URL}/event/${slug}${suffix}`;
}

async function reserveDelivery(
  supabase: any,
  params: {
    notificationKey: string;
    recipient: TelegramRecipient;
    type: string;
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_notification_deliveries")
    .insert({
      notification_key: params.notificationKey,
      recipient_privy_user_id: params.recipient.privyUserId,
      chat_id: params.recipient.chatId,
      type: params.type,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }

  return data?.id || null;
}

export async function dispatchTelegramNotification(
  supabase: any,
  params: {
    type: string;
    notificationKey: string;
    recipients: TelegramRecipient[];
    title: string;
    lines?: Array<string | null | undefined>;
    ctaUrl?: string | null;
    ctaLabel?: string;
  },
): Promise<TelegramDispatchResult> {
  const uniqueRecipients = Array.from(
    new Map(params.recipients.map((recipient) => [recipient.chatId, recipient])).values(),
  );
  const message = buildTelegramMessage({ title: params.title, lines: params.lines });
  const result: TelegramDispatchResult = { sent: 0, failed: 0, skipped: 0, total: uniqueRecipients.length };

  for (let i = 0; i < uniqueRecipients.length; i += BATCH_SIZE) {
    const batch = uniqueRecipients.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (recipient) => {
      try {
        const deliveryId = await reserveDelivery(supabase, {
          notificationKey: params.notificationKey,
          recipient,
          type: params.type,
        });
        if (!deliveryId) {
          result.skipped += 1;
          return;
        }

        const sendResult = await sendTelegramMessage({
          chatId: recipient.chatId,
          text: message,
          ctaUrl: params.ctaUrl,
          ctaLabel: params.ctaLabel,
        });

        if (sendResult.ok) {
          result.sent += 1;
          await supabase
            .from("telegram_notification_deliveries")
            .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", deliveryId);
          return;
        }

        result.failed += 1;
        await supabase
          .from("telegram_notification_deliveries")
          .update({
            status: "failed",
            error: sendResult.error || "telegram_send_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", deliveryId);
      } catch (error) {
        result.failed += 1;
        console.error("[telegram-dispatch] delivery failed", error);
      }
    }));
    if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
  }

  return result;
}

export async function notifyTicketIssuedTelegram(
  supabase: any,
  params: { eventId: string; ownerWallet: string; reference?: string | null; txHash?: string | null },
) {
  try {
    const { data: event, error } = await supabase
      .from("events")
      .select("id, title, date, lock_address, creator_id")
      .eq("id", params.eventId)
      .maybeSingle();
    if (error || !event) throw error || new Error("event_not_found");

    const recipients = await getEventOrganizerTelegramRecipients(supabase, event);
    return await dispatchTelegramNotification(supabase, {
      type: "ticket_issued",
      notificationKey: `ticket_issued:${event.id}:${String(params.ownerWallet).toLowerCase()}:${params.reference || params.txHash || "unknown"}`,
      recipients,
      title: "New ticket issued",
      lines: [`${event.title}`, `Buyer wallet: ${String(params.ownerWallet).toLowerCase()}`],
      ctaUrl: eventUrl(event),
      ctaLabel: "View event",
    });
  } catch (error) {
    console.error("[telegram-dispatch] ticket issued notification failed", error);
  }
}

export async function notifyEventPostTelegram(
  supabase: any,
  params: { event: any; post: any; authorPrivyUserId?: string | null; eventUrl?: string | null },
) {
  try {
    const recipients = excludePrivyUser(
      await getEventTicketHolderTelegramRecipients(supabase, params.event.id),
      params.authorPrivyUserId,
    );
    const ctaUrl = params.eventUrl || eventUrl(params.event, `/discussions?post=${encodeURIComponent(params.post.id)}`);
    return await dispatchTelegramNotification(supabase, {
      type: "event_post",
      notificationKey: `event_post:${params.post.id}`,
      recipients,
      title: "New event post",
      lines: [params.event.title, String(params.post.content || "").slice(0, 600)],
      ctaUrl,
      ctaLabel: "Read post",
    });
  } catch (error) {
    console.error("[telegram-dispatch] event post notification failed", error);
  }
}

export async function notifyCommentTelegram(
  supabase: any,
  params: { event: any; postId: string; comment: any; commenterPrivyUserId?: string | null },
) {
  try {
    const recipients = excludePrivyUser(
      await getEventOrganizerTelegramRecipients(supabase, params.event, "manage_discussions"),
      params.commenterPrivyUserId,
    );
    return await dispatchTelegramNotification(supabase, {
      type: "post_comment",
      notificationKey: `post_comment:${params.comment.id}`,
      recipients,
      title: "New event discussion comment",
      lines: [params.event.title, String(params.comment.content || "").slice(0, 600)],
      ctaUrl: eventUrl(params.event, `/discussions?post=${encodeURIComponent(params.postId)}`),
      ctaLabel: "Open discussion",
    });
  } catch (error) {
    console.error("[telegram-dispatch] comment notification failed", error);
  }
}

export async function notifyOrganizerEventCreatedTelegram(supabase: any, event: any) {
  try {
    if (!event?.creator_id) return;
    const recipients = await getOrganizerSubscriberTelegramRecipients(supabase, event.creator_id);
    return await dispatchTelegramNotification(supabase, {
      type: "organizer_event_created",
      notificationKey: `organizer_event_created:${event.id}`,
      recipients,
      title: "Organizer created a new event",
      lines: [event.title, event.date ? `Date: ${event.date}` : null],
      ctaUrl: eventUrl(event),
      ctaLabel: "View event",
    });
  } catch (error) {
    console.error("[telegram-dispatch] organizer event notification failed", error);
  }
}

export async function notifyRewardWinnersDeclaredTelegram(
  supabase: any,
  params: { rewardPoolId: string; eventLockAddress?: string | null; chainId?: number | string | null },
) {
  try {
    if (!params.eventLockAddress || !params.chainId) return;
    const { data: event, error } = await supabase
      .from("events")
      .select("id, title, lock_address")
      .eq("lock_address", String(params.eventLockAddress).toLowerCase())
      .eq("chain_id", Number(params.chainId))
      .maybeSingle();
    if (error || !event) throw error || new Error("event_not_found");

    const recipients = await getEventTicketHolderTelegramRecipients(supabase, event.id);
    return await dispatchTelegramNotification(supabase, {
      type: "reward_winners_declared",
      notificationKey: `reward_winners_declared:${params.rewardPoolId}`,
      recipients,
      title: "Winners declared",
      lines: [event.title, "Reward results are now available."],
      ctaUrl: eventUrl(event),
      ctaLabel: "View winners",
    });
  } catch (error) {
    console.error("[telegram-dispatch] winners notification failed", error);
  }
}

export async function notifyProtectedEventFailedTelegram(supabase: any, event: any) {
  try {
    const recipients = await getEventTicketHolderTelegramRecipients(supabase, event.id);
    return await dispatchTelegramNotification(supabase, {
      type: "protected_event_failed",
      notificationKey: `protected_event_failed:${event.id}`,
      recipients,
      title: "Protected event refund is available",
      lines: [event.title, "This protected event did not meet the required threshold. Open the event to start the cancellation/refund flow."],
      ctaUrl: eventUrl(event),
      ctaLabel: "Open refund page",
    });
  } catch (error) {
    console.error("[telegram-dispatch] protected event failed notification failed", error);
  }
}

export async function notifyProtectedEventRefundedTelegram(supabase: any, event: any) {
  try {
    const recipients = await getEventTicketHolderTelegramRecipients(supabase, event.id, ["active", "refunded"]);
    return await dispatchTelegramNotification(supabase, {
      type: "protected_event_refunded",
      notificationKey: `protected_event_refunded:${event.id}`,
      recipients,
      title: "Protected event refund completed",
      lines: [event.title, "Your ticket refund has been completed."],
      ctaUrl: eventUrl(event),
      ctaLabel: "View event",
    });
  } catch (error) {
    console.error("[telegram-dispatch] protected event refunded notification failed", error);
  }
}
