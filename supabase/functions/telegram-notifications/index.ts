/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { handleError } from "../_shared/error-handler.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_TTL_MINUTES = Number(Deno.env.get("TELEGRAM_LINK_TOKEN_TTL_MINUTES") || "15");

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function ensureProfile(supabase: any, privyUserId: string) {
  const { error } = await supabase
    .from("app_user_profiles")
    .upsert(
      { privy_user_id: privyUserId, updated_at: new Date().toISOString() },
      { onConflict: "privy_user_id" },
    );
  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  let privyUserId: string | undefined;
  try {
    privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");

    await ensureProfile(supabase, privyUserId);

    if (action === "status") {
      const { data: profile, error } = await supabase
        .from("app_user_profiles")
        .select("telegram_chat_id, telegram_notifications_enabled, telegram_linked_at, telegram_disabled_at")
        .eq("privy_user_id", privyUserId)
        .maybeSingle();
      if (error) throw error;

      let subscribed = false;
      const organizerId = typeof body.organizer_privy_user_id === "string" ? body.organizer_privy_user_id : null;
      if (organizerId) {
        const { data: subscription, error: subError } = await supabase
          .from("telegram_organizer_subscriptions")
          .select("id")
          .eq("subscriber_privy_user_id", privyUserId)
          .eq("organizer_privy_user_id", organizerId)
          .is("unsubscribed_at", null)
          .maybeSingle();
        if (subError) throw subError;
        subscribed = Boolean(subscription);
      }

      return json({
        ok: true,
        linked: Boolean(profile?.telegram_chat_id),
        enabled: profile?.telegram_notifications_enabled === true,
        linked_at: profile?.telegram_linked_at || null,
        disabled_at: profile?.telegram_disabled_at || null,
        subscribed,
      });
    }

    if (action === "start_link") {
      const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME");
      if (!botUsername) return json({ ok: false, error: "TELEGRAM_BOT_USERNAME is not configured" }, 500);

      await supabase
        .from("telegram_activation_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("privy_user_id", privyUserId)
        .is("used_at", null);

      const token = randomToken();
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("telegram_activation_tokens")
        .insert({ token, privy_user_id: privyUserId, expires_at: expiresAt });
      if (error) throw error;

      return json({
        ok: true,
        deep_link: `https://t.me/${botUsername.replace(/^@/, "")}?start=${encodeURIComponent(token)}`,
        expires_at: expiresAt,
      });
    }

    if (action === "disable") {
      const { error } = await supabase
        .from("app_user_profiles")
        .update({
          telegram_chat_id: null,
          telegram_notifications_enabled: false,
          telegram_disabled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("privy_user_id", privyUserId);
      if (error) throw error;
      return json({ ok: true, linked: false, enabled: false });
    }

    if (action === "subscribe_organizer") {
      const organizerId = typeof body.organizer_privy_user_id === "string" ? body.organizer_privy_user_id : "";
      if (!organizerId) return json({ ok: false, error: "organizer_privy_user_id is required" }, 400);
      if (organizerId === privyUserId) return json({ ok: false, error: "You cannot subscribe to yourself" }, 400);

      const { data: profile, error: profileError } = await supabase
        .from("app_user_profiles")
        .select("telegram_chat_id, telegram_notifications_enabled")
        .eq("privy_user_id", privyUserId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.telegram_chat_id || profile.telegram_notifications_enabled !== true) {
        return json({ ok: false, error: "Link Telegram before subscribing to organizers" }, 400);
      }

      const { data: existing, error: existingError } = await supabase
        .from("telegram_organizer_subscriptions")
        .select("id, unsubscribed_at")
        .eq("subscriber_privy_user_id", privyUserId)
        .eq("organizer_privy_user_id", organizerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.id) {
        const { error } = await supabase
          .from("telegram_organizer_subscriptions")
          .update({ unsubscribed_at: null, created_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("telegram_organizer_subscriptions")
          .insert({
            subscriber_privy_user_id: privyUserId,
            organizer_privy_user_id: organizerId,
          });
        if (error) throw error;
      }
      return json({ ok: true, subscribed: true });
    }

    if (action === "unsubscribe_organizer") {
      const organizerId = typeof body.organizer_privy_user_id === "string" ? body.organizer_privy_user_id : "";
      if (!organizerId) return json({ ok: false, error: "organizer_privy_user_id is required" }, 400);
      const { error } = await supabase
        .from("telegram_organizer_subscriptions")
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq("subscriber_privy_user_id", privyUserId)
        .eq("organizer_privy_user_id", organizerId)
        .is("unsubscribed_at", null);
      if (error) throw error;
      return json({ ok: true, unsubscribed: true });
    }

    if (action === "list_subscriptions") {
      const { data, error } = await supabase
        .from("telegram_organizer_subscriptions")
        .select("organizer_privy_user_id, created_at")
        .eq("subscriber_privy_user_id", privyUserId)
        .is("unsubscribed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ ok: true, subscriptions: data || [] });
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    return handleError(error, privyUserId, { "Content-Type": "application/json" });
  }
});
