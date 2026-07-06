/* deno-lint-ignore-file no-explicit-any */

export type TelegramSendResult = {
  ok: boolean;
  error?: string;
};

export function escapeTelegramHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildTelegramMessage(params: {
  title: string;
  lines?: Array<string | null | undefined>;
}): string {
  const lines = [
    `<b>${escapeTelegramHtml(params.title)}</b>`,
    ...(params.lines || []).filter((line): line is string => Boolean(line?.trim())).map(escapeTelegramHtml),
  ];
  return lines.join("\n\n");
}

export async function sendTelegramMessage(params: {
  chatId: number | string;
  text: string;
  ctaUrl?: string | null;
  ctaLabel?: string;
}): Promise<TelegramSendResult> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  }

  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (params.ctaUrl) {
    body.reply_markup = {
      inline_keyboard: [[{ text: params.ctaLabel || "Open Teerex", url: params.ctaUrl }]],
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return {
        ok: false,
        error: payload?.description || `Telegram send failed with status ${response.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Telegram send failed",
    };
  }
}
