/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { enforcePost } from "../_shared/http.ts";
import { handleError } from "../_shared/error-handler.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/constants.ts";
import { getUserWalletAddresses, verifyPrivyToken } from "../_shared/privy.ts";
import {
  EVENT_MANAGER_PERMISSIONS,
  getEventAuthorization,
  hasAnyPermission,
  normalizeEmail,
  parseManagerPermissions,
  normalizeWalletAddress,
} from "../_shared/event-auth.ts";

const badRequest = (message: string) =>
  new Response(
    JSON.stringify({ ok: false, error: message }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
  );

const parsePermissionsResponse = (input: unknown) => {
  try {
    return { permissions: parseManagerPermissions(input), response: null };
  } catch (error: any) {
    return { permissions: null, response: badRequest(error?.message || "Invalid manager permissions") };
  }
};

const listManagers = async (supabase: any, eventId: string) => {
  const { data, error } = await supabase
    .from("event_managers")
    .select("id, event_id, wallet_address, email, label, permissions, added_by, created_at, updated_at")
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  const methodGuard = enforcePost(req);
  if (methodGuard) return methodGuard;

  let privyUserId: string | undefined;

  try {
    privyUserId = await verifyPrivyToken(req.headers.get("X-Privy-Authorization"));
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const eventId = String(body?.event_id || body?.eventId || "");

    if (!action || !eventId) {
      return new Response(
        JSON.stringify({ ok: false, error: "action and event_id are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, creator_id, lock_address, chain_id")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ ok: false, error: "Event not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
      );
    }

    if (action === "my_permissions") {
      const auth = await getEventAuthorization({
        supabase,
        event,
        privyUserId,
        allowOnchainManager: true,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          ...auth,
          userWallets: undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (event.creator_id !== privyUserId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized: only the event creator can manage offchain managers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
      );
    }

    if (action === "list") {
      const managers = await listManagers(supabase, eventId);
      return new Response(
        JSON.stringify({ ok: true, managers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (action === "add") {
      const input = String(body?.identifier || body?.wallet_address || body?.email || "").trim();
      const label = typeof body?.label === "string" ? body.label.trim().slice(0, 80) : null;
      const parsed = parsePermissionsResponse(body?.permissions);
      if (parsed.response) return parsed.response;
      const permissions = parsed.permissions!;

      if (!hasAnyPermission(permissions)) {
        return new Response(
          JSON.stringify({ ok: false, error: "At least one manager permission is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      let walletAddress = normalizeWalletAddress(input);
      let email: string | null = null;
      let managerPrivyUserId: string | null = null;

      if (!walletAddress) {
        email = normalizeEmail(input);
        if (!email) {
          return new Response(
            JSON.stringify({ ok: false, error: "Enter a valid wallet address or app user email" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
          );
        }

        const { data: profile, error: profileError } = await supabase
          .from("app_user_profiles")
          .select("privy_user_id, email, primary_wallet_address, wallet_addresses")
          .eq("email", email)
          .maybeSingle();

        if (profileError) throw profileError;
        const profileWallet =
          normalizeWalletAddress(profile?.primary_wallet_address) ||
          normalizeWalletAddress(Array.isArray(profile?.wallet_addresses) ? profile.wallet_addresses[0] : null);

        if (!profile || !profileWallet) {
          return new Response(
            JSON.stringify({ ok: false, error: "No app user with that email and wallet was found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
          );
        }

        walletAddress = profileWallet;
        managerPrivyUserId = profile.privy_user_id || null;
        email = profile.email || email;
      }

      const creatorWallets = await getUserWalletAddresses(privyUserId);
      if (creatorWallets.map((addr) => addr.toLowerCase()).includes(walletAddress)) {
        return new Response(
          JSON.stringify({ ok: false, error: "The event creator does not need to be added as a manager" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const { data: manager, error } = await supabase
        .from("event_managers")
        .insert({
          event_id: eventId,
          wallet_address: walletAddress,
          privy_user_id: managerPrivyUserId,
          email,
          label,
          permissions,
          added_by: privyUserId,
        })
        .select("id, event_id, wallet_address, email, label, permissions, added_by, created_at, updated_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return new Response(
            JSON.stringify({ ok: false, error: "That wallet is already an active manager for this event" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 },
          );
        }
        throw error;
      }

      return new Response(
        JSON.stringify({ ok: true, manager }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (action === "update_permissions") {
      const managerId = String(body?.manager_id || "");
      const parsed = parsePermissionsResponse(body?.permissions);
      if (parsed.response) return parsed.response;
      const permissions = parsed.permissions!;
      if (!managerId) {
        return new Response(
          JSON.stringify({ ok: false, error: "manager_id is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
      if (!hasAnyPermission(permissions)) {
        return new Response(
          JSON.stringify({ ok: false, error: "At least one manager permission is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const { data: manager, error } = await supabase
        .from("event_managers")
        .update({ permissions, updated_at: new Date().toISOString() })
        .eq("id", managerId)
        .eq("event_id", eventId)
        .is("revoked_at", null)
        .select("id, event_id, wallet_address, email, label, permissions, added_by, created_at, updated_at")
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true, manager }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (action === "remove") {
      const managerId = String(body?.manager_id || "");
      if (!managerId) {
        return new Response(
          JSON.stringify({ ok: false, error: "manager_id is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const { error } = await supabase
        .from("event_managers")
        .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", managerId)
        .eq("event_id", eventId)
        .is("revoked_at", null);

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: `Unsupported action. Use one of: list, add, update_permissions, remove, my_permissions. Supported permissions: ${EVENT_MANAGER_PERMISSIONS.join(", ")}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  } catch (error: any) {
    return handleError(error, privyUserId, { "Content-Type": "application/json" });
  }
});
