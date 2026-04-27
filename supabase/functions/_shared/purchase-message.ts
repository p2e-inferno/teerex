/**
 * Shared helpers for the per-event purchase confirmation message.
 *
 * The message is creator-authored rich text (HTML). On the server we:
 *  - Reject obviously dangerous tags (script/iframe/embed/object/style)
 *  - Strip on* event-handler attributes and javascript: URLs from anchors
 *  - Cap length to match the DB CHECK constraint
 *  - Normalize empty / whitespace-only HTML to NULL
 *
 * Client display still passes through DOMPurify in `RichTextDisplay`, so this
 * is a defense-in-depth pass at the trust boundary.
 */

export const PURCHASE_MESSAGE_MAX_HTML_LENGTH = 10000;

const DANGEROUS_BLOCK_TAGS = /<\s*\/?\s*(?:script|iframe|object|embed|style|link|meta)\b[\s\S]*?>/gi;
const DANGEROUS_BLOCK_CONTENT = /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL = /(href|src|xlink:href)\s*=\s*("|')\s*javascript:[^"'>]*(\2)/gi;
const EMPTY_PLAINTEXT = /<[^>]+>|&nbsp;|&#160;|\s/g;

export function sanitizePurchaseMessage(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let html = input.trim();
  if (!html) return null;

  // Remove script/style blocks with their content first.
  html = html.replace(DANGEROUS_BLOCK_CONTENT, "");
  // Remove any remaining dangerous tag openings/closings.
  html = html.replace(DANGEROUS_BLOCK_TAGS, "");
  // Strip event-handler attributes (onclick, onerror, etc.).
  html = html.replace(EVENT_HANDLER_ATTR, "");
  // Strip javascript: URLs in href/src attributes.
  html = html.replace(JAVASCRIPT_URL, "$1=$2#$2");

  html = html.trim();
  if (!html) return null;

  // Reject if the visible content is empty after sanitization (only whitespace / tags).
  const plainTextOnly = html.replace(EMPTY_PLAINTEXT, "");
  if (!plainTextOnly) return null;

  if (html.length > PURCHASE_MESSAGE_MAX_HTML_LENGTH) {
    throw new Error(
      `purchase_confirmation_message exceeds ${PURCHASE_MESSAGE_MAX_HTML_LENGTH} characters`
    );
  }

  return html;
}

export async function getEventPurchaseMessageSnapshot(
  supabase: any,
  eventId: string | null | undefined,
): Promise<string | null> {
  if (!eventId) return null;

  const { data, error } = await supabase
    .from("event_purchase_messages")
    .select("message_html")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[purchase-message] Failed to load event purchase message:", error);
    return null;
  }

  return data?.message_html || null;
}
