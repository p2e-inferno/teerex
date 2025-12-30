/**
 * Submit Payout Account Edge Function
 *
 * Vendors submit their banking details for payout account creation.
 * Uses pluggable verification module to verify the account.
 * If verification passes, creates Paystack subaccount automatically.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import {
  createPaystackSubaccount,
  maskAccountNumber,
  isValidNigerianAccountNumber,
} from "../_shared/paystack.ts";
import {
  verifyVendor,
  getVerificationStrategy,
  type VerificationContext,
} from "../_shared/verification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SubmitPayoutAccountRequest {
  provider?: string; // default: "paystack"
  business_name: string;
  settlement_bank_code: string;
  settlement_bank_name?: string;
  account_number: string;
  primary_contact_email?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
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

    // 2. Parse and validate request body
    const body: SubmitPayoutAccountRequest = await req.json();
    const provider = body.provider || "paystack";

    if (!body.business_name?.trim()) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Business name is required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (!body.settlement_bank_code?.trim()) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Settlement bank is required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (!body.account_number?.trim()) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Account number is required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate account number format
    if (!isValidNigerianAccountNumber(body.account_number)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Account number must be exactly 10 digits",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // 3. Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Check if vendor already has verified or pending account for this provider
    const { data: existingAccount, error: existingError } = await supabase
      .from("vendor_payout_accounts")
      .select("id, status")
      .eq("vendor_id", vendorId)
      .eq("provider", provider)
      .in("status", ["verified", "pending_verification"])
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing account:", existingError);
      return new Response(
        JSON.stringify({ ok: false, error: "Database error" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (existingAccount) {
      const message =
        existingAccount.status === "verified"
          ? "You already have a verified payout account"
          : "You have a pending verification. Please wait or retry.";
      return new Response(
        JSON.stringify({
          ok: false,
          error: message,
          existing_status: existingAccount.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        }
      );
    }

    // 5. Get platform commission rate from config
    const { data: configData } = await supabase
      .from("platform_config")
      .select("value")
      .eq("key", "default_payout_commission")
      .maybeSingle();

    const percentageCharge = configData?.value?.percentage ?? 5;

    // 6. Create initial record with pending_verification status
    const { data: payoutAccount, error: insertError } = await supabase
      .from("vendor_payout_accounts")
      .insert({
        vendor_id: vendorId,
        provider,
        business_name: body.business_name.trim(),
        settlement_bank_code: body.settlement_bank_code.trim(),
        settlement_bank_name: body.settlement_bank_name?.trim() || null,
        account_number: body.account_number.trim(),
        currency: "NGN",
        percentage_charge: percentageCharge,
        status: "pending_verification",
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating payout account:", insertError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create payout account" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 7. Run verification using pluggable strategy
    const verificationContext: VerificationContext = {
      vendor_id: vendorId,
      provider,
      business_name: body.business_name.trim(),
      settlement_bank_code: body.settlement_bank_code.trim(),
      account_number: body.account_number.trim(),
    };

    const strategy = getVerificationStrategy();
    const verificationResult = await verifyVendor(verificationContext, strategy);

    // 8. Handle verification result
    if (!verificationResult.verified) {
      // Update record with failure status
      await supabase
        .from("vendor_payout_accounts")
        .update({
          status: "verification_failed",
          verification_error: verificationResult.error,
          verification_status: "failed",
        })
        .eq("id", payoutAccount.id);

      return new Response(
        JSON.stringify({
          ok: false,
          error: verificationResult.error || "Verification failed",
          payout_account: {
            id: payoutAccount.id,
            status: "verification_failed",
            business_name: payoutAccount.business_name,
            account_number: maskAccountNumber(payoutAccount.account_number),
          },
          can_retry: true,
          retry_hint: verificationResult.retryHint,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Return 200 so frontend can handle gracefully
        }
      );
    }

    // 9. Verification passed - create Paystack subaccount
    const accountHolderName =
      (verificationResult.metadata?.account_name as string) ||
      body.business_name.trim();

    let paystackSubaccount;
    try {
      paystackSubaccount = await createPaystackSubaccount({
        business_name: body.business_name.trim(),
        settlement_bank: body.settlement_bank_code.trim(),
        account_number: body.account_number.trim(),
        percentage_charge: percentageCharge,
        primary_contact_email: body.primary_contact_email?.trim(),
        primary_contact_name: body.primary_contact_name?.trim(),
        primary_contact_phone: body.primary_contact_phone?.trim(),
        metadata: {
          vendor_id: vendorId,
          account_holder_name: accountHolderName,
        },
      });
    } catch (paystackError) {
      const message =
        paystackError instanceof Error
          ? paystackError.message
          : "Paystack subaccount creation failed";

      // Update record with failure
      await supabase
        .from("vendor_payout_accounts")
        .update({
          status: "verification_failed",
          verification_error: message,
          verification_status: "subaccount_creation_failed",
        })
        .eq("id", payoutAccount.id);

      return new Response(
        JSON.stringify({
          ok: false,
          error: message,
          payout_account: {
            id: payoutAccount.id,
            status: "verification_failed",
          },
          can_retry: true,
          retry_hint: "Please try again or contact support if the issue persists",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 10. Update record with verified status and Paystack details
    const { data: updatedAccount, error: updateError } = await supabase
      .from("vendor_payout_accounts")
      .update({
        status: "verified",
        is_verified: paystackSubaccount.data.is_verified,
        provider_account_id: String(paystackSubaccount.data.id),
        provider_account_code: paystackSubaccount.data.subaccount_code,
        account_holder_name: accountHolderName,
        verification_status: "verified",
        verified_at: new Date().toISOString(),
        settlement_schedule: paystackSubaccount.data.settlement_schedule,
        provider_metadata: paystackSubaccount.data,
      })
      .eq("id", payoutAccount.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating payout account:", updateError);
      // Subaccount was created but DB update failed - log for manual reconciliation
      console.error(
        "CRITICAL: Paystack subaccount created but DB update failed:",
        {
          payoutAccountId: payoutAccount.id,
          subaccountCode: paystackSubaccount.data.subaccount_code,
        }
      );
    }

    // 11. Return success response
    return new Response(
      JSON.stringify({
        ok: true,
        payout_account: {
          id: updatedAccount?.id || payoutAccount.id,
          status: "verified",
          business_name: body.business_name.trim(),
          account_number: maskAccountNumber(body.account_number),
          settlement_bank_name: body.settlement_bank_name,
          provider_account_code: paystackSubaccount.data.subaccount_code,
          percentage_charge: percentageCharge,
        },
        verification_metadata: {
          account_name: accountHolderName,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Unexpected error in submit-payout-account:", error);
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
