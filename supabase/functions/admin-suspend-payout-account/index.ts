/**
 * Admin Suspend/Unsuspend Payout Account Edge Function
 *
 * Admin endpoint to suspend or unsuspend a vendor's payout account.
 * Suspended accounts cannot receive fiat payments.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { maskAccountNumber } from "../_shared/paystack.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SuspendRequest {
  payout_account_id: string;
  action: "suspend" | "unsuspend";
  reason?: string; // Required for suspend action
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 405,
        }
      );
    }

    // 1. Verify admin access
    let adminUserId: string;
    try {
      adminUserId = await ensureAdmin(req.headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      const status = message === "unauthorized" ? 403 : 401;
      return new Response(
        JSON.stringify({ ok: false, error: message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status,
        }
      );
    }

    // 2. Parse request body
    const body: SuspendRequest = await req.json();

    if (!body.payout_account_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "payout_account_id is required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (!body.action || !["suspend", "unsuspend"].includes(body.action)) {
      return new Response(
        JSON.stringify({ ok: false, error: "action must be 'suspend' or 'unsuspend'" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (body.action === "suspend" && !body.reason?.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "reason is required when suspending" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // 3. Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Fetch existing payout account
    const { data: existingAccount, error: fetchError } = await supabase
      .from("vendor_payout_accounts")
      .select("*")
      .eq("id", body.payout_account_id)
      .maybeSingle();

    if (fetchError || !existingAccount) {
      return new Response(
        JSON.stringify({ ok: false, error: "Payout account not found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // 5. Validate state transitions
    if (body.action === "suspend") {
      // Can only suspend verified accounts
      if (existingAccount.status === "suspended") {
        return new Response(
          JSON.stringify({ ok: false, error: "Account is already suspended" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }
      if (existingAccount.status !== "verified") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Cannot suspend account with status: ${existingAccount.status}. Only verified accounts can be suspended.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }
    } else {
      // Unsuspend: Can only unsuspend suspended accounts
      if (existingAccount.status !== "suspended") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Cannot unsuspend account with status: ${existingAccount.status}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }
    }

    // 6. Perform action
    let updateData: Record<string, unknown>;

    if (body.action === "suspend") {
      updateData = {
        status: "suspended",
        suspended_by: adminUserId,
        suspended_at: new Date().toISOString(),
        suspension_reason: body.reason?.trim(),
      };
    } else {
      // Unsuspend - restore to verified status
      updateData = {
        status: "verified",
        suspended_by: null,
        suspended_at: null,
        suspension_reason: null,
      };
    }

    const { data: updatedAccount, error: updateError } = await supabase
      .from("vendor_payout_accounts")
      .update(updateData)
      .eq("id", body.payout_account_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating payout account:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to update payout account" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 7. Return success response
    return new Response(
      JSON.stringify({
        ok: true,
        action: body.action,
        payout_account: {
          id: updatedAccount.id,
          vendor_id: updatedAccount.vendor_id,
          business_name: updatedAccount.business_name,
          account_number: maskAccountNumber(updatedAccount.account_number),
          status: updatedAccount.status,
          ...(updatedAccount.status === "suspended" && {
            suspended_at: updatedAccount.suspended_at,
            suspended_by: updatedAccount.suspended_by,
            suspension_reason: updatedAccount.suspension_reason,
          }),
        },
        message:
          body.action === "suspend"
            ? "Account suspended successfully. Vendor can no longer receive fiat payments."
            : "Account unsuspended successfully. Vendor can now receive fiat payments.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Unexpected error in admin-suspend-payout-account:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
