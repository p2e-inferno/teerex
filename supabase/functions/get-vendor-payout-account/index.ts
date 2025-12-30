/**
 * Get Vendor Payout Account Edge Function
 *
 * Returns the authenticated vendor's payout account status.
 * Used by vendor dashboard to show account status and payment eligibility.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { maskAccountNumber } from "../_shared/paystack.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 405,
        }
      );
    }

    // 1. Verify Privy authentication
    const authHeader = req.headers.get("X-Privy-Authorization");
    let vendorId: string;
    try {
      vendorId = await verifyPrivyToken(authHeader);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      return new Response(
        JSON.stringify({ ok: false, error: message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // 2. Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Get query params (provider and optional vendor_id for checking other vendors)
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") || "paystack";
    const queryVendorId = url.searchParams.get("vendor_id");

    // Use queryVendorId if provided (for checking other vendors), otherwise use authenticated user's ID
    const targetVendorId = queryVendorId || vendorId;

    // 4. Fetch vendor's payout account for the specified provider
    const { data: payoutAccount, error: fetchError } = await supabase
      .from("vendor_payout_accounts")
      .select(`
        id,
        provider,
        business_name,
        account_holder_name,
        settlement_bank_code,
        settlement_bank_name,
        account_number,
        currency,
        percentage_charge,
        status,
        is_verified,
        verification_status,
        verification_error,
        submitted_at,
        verified_at,
        suspended_at,
        suspension_reason,
        settlement_schedule,
        provider_account_code
      `)
      .eq("vendor_id", targetVendorId)
      .eq("provider", provider)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching payout account:", fetchError);
      return new Response(
        JSON.stringify({ ok: false, error: "Database error" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 5. No account found
    if (!payoutAccount) {
      return new Response(
        JSON.stringify({
          ok: true,
          payout_account: null,
          can_receive_fiat_payments: false,
          message: "No payout account found. Submit your banking details to receive fiat payments.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 6. Determine if vendor can receive fiat payments
    const canReceiveFiatPayments =
      payoutAccount.status === "verified" && payoutAccount.is_verified === true;

    // 7. Build response with masked sensitive data
    const response = {
      ok: true,
      payout_account: {
        id: payoutAccount.id,
        provider: payoutAccount.provider,
        business_name: payoutAccount.business_name,
        account_holder_name: payoutAccount.account_holder_name,
        settlement_bank_code: payoutAccount.settlement_bank_code,
        settlement_bank_name: payoutAccount.settlement_bank_name,
        account_number: maskAccountNumber(payoutAccount.account_number),
        currency: payoutAccount.currency,
        percentage_charge: payoutAccount.percentage_charge,
        status: payoutAccount.status,
        is_verified: payoutAccount.is_verified,
        verification_status: payoutAccount.verification_status,
        submitted_at: payoutAccount.submitted_at,
        verified_at: payoutAccount.verified_at,
        settlement_schedule: payoutAccount.settlement_schedule,
        has_subaccount: !!payoutAccount.provider_account_code,
        // Include error info for failed/suspended accounts
        ...(payoutAccount.status === "verification_failed" && {
          verification_error: payoutAccount.verification_error,
          can_retry: true,
        }),
        ...(payoutAccount.status === "suspended" && {
          suspended_at: payoutAccount.suspended_at,
          suspension_reason: payoutAccount.suspension_reason,
        }),
      },
      can_receive_fiat_payments: canReceiveFiatPayments,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Unexpected error in get-vendor-payout-account:", error);
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
