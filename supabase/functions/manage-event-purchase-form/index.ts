import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { handleError } from "../_shared/error-handler.ts";
import { requireEventAuthorization } from "../_shared/event-auth.ts";
import {
  assertAdditiveSchemaEdit,
  eventHasAnyTickets,
  validatePurchaseFormSchema,
} from "../_shared/purchase-form.ts";

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
      .select("id, creator_id, lock_address, chain_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return json({ ok: false, error: eventError.message }, 500);
    }
    if (!event) {
      return json({ ok: false, error: "event_not_found" }, 404);
    }

    // GET allows any authenticated user (the schema is public read for the
    // purchase dialog), but writes require creator/manager authorization.
    if (action === "get") {
      const { data, error } = await supabase
        .from("event_purchase_form_schemas")
        .select("schema_json, updated_at")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) {
        return json({ ok: false, error: error.message }, 500);
      }
      return json({
        ok: true,
        purchase_form_schema: (data as any)?.schema_json ?? null,
        updated_at: (data as any)?.updated_at ?? null,
      });
    }

    await requireEventAuthorization({
      supabase,
      event,
      privyUserId: privyUserId!,
      errorMessage: "Only the event creator or an authorized manager can edit this form.",
    });

    if (action === "delete") {
      // Removing the schema entirely is non-additive; only allowed before any
      // ticket has been issued.
      if (await eventHasAnyTickets(supabase, eventId)) {
        return json(
          {
            ok: false,
            error: "Cannot delete the purchase form once tickets have been issued. Mark fields as optional instead.",
          },
          400,
        );
      }
      const { error } = await supabase
        .from("event_purchase_form_schemas")
        .delete()
        .eq("event_id", eventId);
      if (error) {
        return json({ ok: false, error: error.message }, 500);
      }
      return json({ ok: true, purchase_form_schema: null });
    }

    if (action !== "upsert") {
      return json({ ok: false, error: "Unsupported action" }, 400);
    }

    let validated;
    try {
      validated = validatePurchaseFormSchema(body?.purchase_form_schema);
    } catch (err) {
      return json(
        { ok: false, error: err instanceof Error ? err.message : "Invalid purchase form schema." },
        400,
      );
    }

    if (!validated) {
      // Effectively a delete via upsert with empty schema.
      if (await eventHasAnyTickets(supabase, eventId)) {
        return json(
          {
            ok: false,
            error: "Cannot remove all fields once tickets have been issued. Mark fields as optional instead.",
          },
          400,
        );
      }
      const { error } = await supabase
        .from("event_purchase_form_schemas")
        .delete()
        .eq("event_id", eventId);
      if (error) {
        return json({ ok: false, error: error.message }, 500);
      }
      return json({ ok: true, purchase_form_schema: null });
    }

    // Enforce additive-only edits if any ticket exists.
    const { data: existing } = await supabase
      .from("event_purchase_form_schemas")
      .select("schema_json")
      .eq("event_id", eventId)
      .maybeSingle();
    const prev = existing?.schema_json
      ? validatePurchaseFormSchema((existing as any).schema_json)
      : null;

    if (await eventHasAnyTickets(supabase, eventId)) {
      try {
        assertAdditiveSchemaEdit(prev, validated);
      } catch (err) {
        return json(
          { ok: false, error: err instanceof Error ? err.message : "Edit not allowed." },
          400,
        );
      }
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("event_purchase_form_schemas")
      .upsert(
        {
          event_id: eventId,
          schema_json: validated,
          updated_by: privyUserId,
          updated_at: nowIso,
        },
        { onConflict: "event_id" },
      )
      .select("schema_json, updated_at")
      .single();

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    return json({
      ok: true,
      purchase_form_schema: (data as any).schema_json,
      updated_at: (data as any).updated_at,
    });
  } catch (error: any) {
    return handleError(error, privyUserId);
  }
});
