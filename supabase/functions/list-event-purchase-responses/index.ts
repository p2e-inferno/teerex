import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { handleError } from "../_shared/error-handler.ts";
import { requireEventAuthorization } from "../_shared/event-auth.ts";
import {
  getPublishedPurchaseFormSchema,
  type PurchaseFormResponseSnapshot,
} from "../_shared/purchase-form.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  let privyUserId: string | undefined;

  try {
    const authHeader = req.headers.get("X-Privy-Authorization");
    privyUserId = await verifyPrivyToken(authHeader);

    const url = new URL(req.url);
    let eventId: string | null = null;
    let format = "json";
    let limit = 100;
    let offset = 0;

    if (req.method === "GET") {
      eventId = url.searchParams.get("event_id");
      format = (url.searchParams.get("format") || "json").toLowerCase();
      limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") || 100)));
      offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    } else {
      const body = await req.json().catch(() => ({}));
      eventId = body?.event_id ?? null;
      format = String(body?.format || "json").toLowerCase();
      limit = Math.max(1, Math.min(1000, Number(body?.limit ?? 100)));
      offset = Math.max(0, Number(body?.offset ?? 0));
    }

    if (!eventId) {
      return json({ ok: false, error: "event_id is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, creator_id, lock_address, chain_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) return json({ ok: false, error: eventError.message }, 500);
    if (!event) return json({ ok: false, error: "event_not_found" }, 404);

    await requireEventAuthorization({
      supabase,
      event,
      privyUserId: privyUserId!,
      errorMessage: "Only the event creator or an authorized manager can view responses.",
    });

    const { schema } = await getPublishedPurchaseFormSchema(supabase, eventId);

    const { data: ticketRows, error: ticketError, count } = await supabase
      .from("tickets")
      .select(
        "id, owner_wallet, user_email, granted_at, created_at, purchase_form_response_snapshot, purchase_form_schema_version_at",
        { count: "exact" },
      )
      .eq("event_id", eventId)
      .eq("status", "active")
      .not("purchase_form_response_snapshot", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (ticketError) return json({ ok: false, error: ticketError.message }, 500);

    const rows = (ticketRows || []).map((t: any) => {
      const snap = (t.purchase_form_response_snapshot ?? {}) as PurchaseFormResponseSnapshot;
      return {
        ticket_id: t.id,
        owner_wallet: t.owner_wallet,
        user_email: t.user_email,
        created_at: t.created_at,
        granted_at: t.granted_at,
        schema_version_at: t.purchase_form_schema_version_at,
        values: snap.values ?? {},
        labels: snap.labels ?? {},
      };
    });

    if (format === "csv") {
      const fieldOrder = (schema?.fields ?? []).map((f) => f.id);
      const labelByField: Record<string, string> = {};
      for (const f of schema?.fields ?? []) labelByField[f.id] = f.label;

      const header = ["ticket_id", "owner_wallet", "user_email", "created_at"];
      for (const fid of fieldOrder) header.push(labelByField[fid] ?? fid);

      const lines: string[] = [header.map(csvEscape).join(",")];
      for (const row of rows) {
        const cols: unknown[] = [
          row.ticket_id,
          row.owner_wallet,
          row.user_email ?? "",
          row.created_at,
        ];
        for (const fid of fieldOrder) {
          const v = (row.values as any)[fid];
          cols.push(v ?? "");
        }
        lines.push(cols.map(csvEscape).join(","));
      }
      const csv = lines.join("\r\n");
      const filename = `${(event.title || "event").replace(/[^a-z0-9-_]+/gi, "_")}-responses.csv`;
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return json({
      ok: true,
      schema,
      rows,
      total: count ?? rows.length,
      limit,
      offset,
    });
  } catch (error: any) {
    return handleError(error, privyUserId);
  }
});
