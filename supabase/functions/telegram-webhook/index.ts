/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders } from "../_shared/cors.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseStartToken(text: string | undefined): string | null {
  const parts = String(text || "").trim().split(/\s+/);
  if (parts[0] !== "/start" || !parts[1]) return null;
  return parts[1];
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let i = 0; i < length; i += 1) {
    diff |= (leftBytes[i] || 0) ^ (rightBytes[i] || 0);
  }

  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const actualSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!expectedSecret || !actualSecret || !timingSafeEqualString(actualSecret, expectedSecret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const update = await req.json().catch(() => ({}));
    const message = update?.message;
    const chat = message?.chat;
    const chatId = chat?.id;

    if (!chatId || chat?.type !== "private") {
      if (chatId) {
        await sendTelegramMessage({
          chatId,
          text: "Please link Telegram from a private chat with this bot.",
        });
      }
      return json({ ok: true, ignored: true });
    }

    const token = parseStartToken(message?.text);
    if (!token) {
      await sendTelegramMessage({
        chatId,
        text: "Open Teerex profile and tap Link Telegram to connect this chat.",
      });
      return json({ ok: true, ignored: true });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: activation, error: activationError } = await supabase
      .from("telegram_activation_tokens")
      .select("id, privy_user_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (activationError) throw activationError;
    if (!activation || activation.used_at || new Date(activation.expires_at).getTime() < Date.now()) {
      await sendTelegramMessage({
        chatId,
        text: "This Teerex Telegram link has expired. Please start a new link from your profile.",
      });
      return json({ ok: true, expired: true });
    }

    const now = new Date().toISOString();
    const { data: claimedToken, error: markError } = await supabase
      .from("telegram_activation_tokens")
      .update({ used_at: now })
      .eq("id", activation.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (markError || !claimedToken) {
      await sendTelegramMessage({
        chatId,
        text: "This Teerex Telegram link has already been used. Please start a new link from your profile.",
      });
      return json({ ok: true, already_used: true });
    }

    const accountKey = String(chatId);
    const { data: claimRows, error: claimError } = await supabase.rpc("claim_social_link", {
      p_provider: "telegram",
      p_account_key: accountKey,
      p_privy_user_id: activation.privy_user_id,
      p_source: "telegram-webhook",
    });
    if (claimError) throw claimError;

    const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
    if (!claim?.claimed) {
      await sendTelegramMessage({
        chatId,
        text: "This Telegram account is already linked to another Teerex profile. Contact support if this is unexpected.",
      });
      return json({ ok: true, conflict: true });
    }

    const { error: profileError } = await supabase
      .from("app_user_profiles")
      .upsert(
        {
          privy_user_id: activation.privy_user_id,
          telegram_chat_id: Number(chatId),
          telegram_notifications_enabled: true,
          telegram_linked_at: now,
          telegram_disabled_at: null,
          updated_at: now,
        },
        { onConflict: "privy_user_id" },
      );
    if (profileError) throw profileError;

    await sendTelegramMessage({
      chatId,
      text: "Telegram notifications are now enabled for your Teerex profile.",
    });

    return json({ ok: true, linked: true });
  } catch (error) {
    console.error("[telegram-webhook]", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
