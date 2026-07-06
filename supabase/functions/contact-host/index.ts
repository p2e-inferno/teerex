/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { resolveDisplayName } from "../_shared/profiles.ts";
import { sendEmail, getContactHostEmail, normalizeEmail } from "../_shared/email-utils.ts";

const APP_URL = Deno.env.get("VITE_TEEREX_DOMAIN") || "https://teerex.live";
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;
const MAX_PER_EVENT_24H = 5;
const MAX_PER_SENDER_24H = 5;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("X-Privy-Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "missing_privy_token" }, 401);
    const senderId = await verifyPrivyToken(authHeader);
    const body = await req.json().catch(() => ({}));

    const eventId = String(body.event_id || "").trim();
    const message = String(body.message || "").trim();
    if (!eventId) return json({ ok: false, error: "event_id_required" }, 400);
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
      return json({ ok: false, error: `message_must_be_${MESSAGE_MIN}_to_${MESSAGE_MAX}_chars` }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("id, title, creator_id")
      .eq("id", eventId)
      .maybeSingle();
    if (evErr) return json({ ok: false, error: evErr.message }, 400);
    if (!event) return json({ ok: false, error: "event_not_found" }, 404);
    if (event.creator_id === senderId) {
      return json({ ok: false, error: "cannot_contact_yourself" }, 400);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: perSender }, { count: perEvent }] = await Promise.all([
      supabase
        .from("event_host_contact_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", senderId)
        .gte("created_at", since),
      supabase
        .from("event_host_contact_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", senderId)
        .eq("event_id", eventId)
        .gte("created_at", since),
    ]);
    if ((perSender ?? 0) >= MAX_PER_SENDER_24H || (perEvent ?? 0) >= MAX_PER_EVENT_24H) {
      return json({ ok: false, error: "rate_limited" }, 429);
    }

    // Host email is server-only PII; never returned to the client.
    const [{ data: hostProfile }, { data: senderProfile }, senderName] = await Promise.all([
      supabase.from("app_user_profiles").select("email").eq("privy_user_id", event.creator_id).maybeSingle(),
      supabase.from("app_user_profiles").select("email, primary_wallet_address").eq("privy_user_id", senderId).maybeSingle(),
      resolveDisplayName(supabase, senderId),
    ]);

    const hostEmail = normalizeEmail(hostProfile?.email);
    if (!hostEmail) return json({ ok: false, error: "host_unreachable" }, 422);

    const senderEmail = normalizeEmail(senderProfile?.email);

    const email = getContactHostEmail({
      eventTitle: event.title,
      eventUrl: `${APP_URL}/event/${eventId}`,
      message,
      senderName,
      senderEmail,
    });
    const result = await sendEmail({
      to: hostEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: senderEmail ?? undefined,
      tags: ["contact-host"],
    });
    if (!result.ok) return json({ ok: false, error: "email_failed" }, 502);

    const { error: insErr } = await supabase.from("event_host_contact_messages").insert({
      event_id: eventId,
      sender_id: senderId,
      sender_wallet: senderProfile?.primary_wallet_address ?? null,
      sender_email: senderEmail,
      message,
    });
    if (insErr) return json({ ok: false, error: insErr.message }, 400);

    return json({ ok: true }, 200);
  } catch (err: any) {
    console.error("[contact-host]", err);
    const status = Number(err?.status) || 500;
    return json({ ok: false, error: err?.message || "Internal error" }, status);
  }
});
