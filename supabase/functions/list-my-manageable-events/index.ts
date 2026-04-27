/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { enforcePost } from "../_shared/http.ts";
import { handleError } from "../_shared/error-handler.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getUserWalletAddresses, verifyPrivyToken } from "../_shared/privy.ts";
import { normalizePermissions, normalizeWalletAddress } from "../_shared/event-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;

  try {
    privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: createdEvents, error: createdError } = await supabase
      .from("events")
      .select("*")
      .eq("creator_id", privyUserId)
      .order("created_at", { ascending: false });

    if (createdError) throw createdError;

    let managedEvents: any[] = [];
    let managedEventsWarning: string | null = null;
    try {
      const wallets = (await getUserWalletAddresses(privyUserId))
        .map((addr) => normalizeWalletAddress(addr))
        .filter((addr): addr is string => Boolean(addr));
      const uniqueWallets = Array.from(new Set(wallets));

      if (uniqueWallets.length > 0) {
        const { data: managerRows, error: managerError } = await supabase
          .from("event_managers")
          .select("id, event_id, wallet_address, email, label, permissions")
          .in("wallet_address", uniqueWallets)
          .is("revoked_at", null);

        if (managerError) throw managerError;

        const rows = managerRows || [];
        const eventIds = Array.from(new Set(rows.map((row: any) => row.event_id).filter(Boolean)));
        const createdIds = new Set((createdEvents || []).map((event: any) => event.id));
        const managerByEvent = new Map(rows.map((row: any) => [row.event_id, row]));

        if (eventIds.length > 0) {
          const { data: events, error: eventsError } = await supabase
            .from("events")
            .select("*")
            .in("id", eventIds)
            .order("created_at", { ascending: false });

          if (eventsError) throw eventsError;

          managedEvents = (events || [])
            .filter((event: any) => !createdIds.has(event.id))
            .map((event: any) => {
              const manager = managerByEvent.get(event.id);
              return {
                ...event,
                manager_permissions: normalizePermissions(manager?.permissions),
                manager_wallet_address: manager?.wallet_address || null,
                manager_label: manager?.label || null,
                manager_email: manager?.email || null,
              };
            });
        }
      }
    } catch (error) {
      console.warn("[list-my-manageable-events] managed event lookup skipped", error);
      managedEventsWarning = "managed_events_unavailable";
    }

    return new Response(
      JSON.stringify({
        ok: true,
        created_events: createdEvents || [],
        managed_events: managedEvents,
        warning: managedEventsWarning,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    return handleError(error, privyUserId, { "Content-Type": "application/json" });
  }
});
