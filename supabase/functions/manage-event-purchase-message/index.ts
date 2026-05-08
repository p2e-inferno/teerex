import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { handleError } from "../_shared/error-handler.ts";
import { sanitizePurchaseMessage } from "../_shared/purchase-message.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  let privyUserId: string | undefined;

  try {
    const authHeader = req.headers.get("X-Privy-Authorization");
    privyUserId = await verifyPrivyToken(authHeader);

    const body = await req.json();
    const eventId = typeof body?.event_id === "string" ? body.event_id : null;
    const action = String(body?.action || "get").toLowerCase();

    if (!eventId) {
      return json({ ok: false, error: "event_id is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, creator_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return json({ ok: false, error: eventError.message }, 500);
    }
    if (!event) {
      return json({ ok: false, error: "event_not_found" }, 404);
    }
    if ((event as any).creator_id !== privyUserId) {
      return json({ ok: false, error: "Only the event creator can manage this message." }, 403);
    }

    if (action === "get") {
      const { data, error } = await supabase
        .from("event_purchase_messages")
        .select("message_html, updated_at")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) {
        return json({ ok: false, error: error.message }, 500);
      }
      return json({
        ok: true,
        purchase_confirmation_message: (data as any)?.message_html ?? null,
        updated_at: (data as any)?.updated_at ?? null,
      });
    }

    if (action === "delete") {
      const { error } = await supabase
        .from("event_purchase_messages")
        .delete()
        .eq("event_id", eventId);
      if (error) {
        return json({ ok: false, error: error.message }, 500);
      }
      return json({ ok: true, purchase_confirmation_message: null });
    }

    if (action !== "upsert") {
      return json({ ok: false, error: "Unsupported action" }, 400);
    }

    let message: string | null;
    try {
      message = sanitizePurchaseMessage(body?.purchase_confirmation_message);
    } catch (err) {
      return json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Invalid purchase confirmation message.",
        },
        400,
      );
    }

    if (!message) {
      const { error } = await supabase
        .from("event_purchase_messages")
        .delete()
        .eq("event_id", eventId);
      if (error) {
        return json({ ok: false, error: error.message }, 500);
      }
      return json({ ok: true, purchase_confirmation_message: null });
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("event_purchase_messages")
      .upsert(
        {
          event_id: eventId,
          message_html: message,
          updated_by: privyUserId,
          updated_at: nowIso,
        },
        { onConflict: "event_id" },
      )
      .select("message_html, updated_at")
      .single();

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    return json({
      ok: true,
      purchase_confirmation_message: (data as any).message_html,
      updated_at: (data as any).updated_at,
    });
  } catch (error: any) {
    return handleError(error, privyUserId);
  }
});
