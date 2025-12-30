/**
 * Retry Payout Verification Edge Function
 *
 * Allows vendors to retry verification after a failed attempt.
 * Can optionally update banking details before retrying.
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

interface RetryVerificationRequest {
  payout_account_id: string;
  // Optional updates
  business_name?: string;
  settlement_bank_code?: string;
  settlement_bank_name?: string;
  account_number?: string;
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

    // 2. Parse request body
    const body: RetryVerificationRequest = await req.json();

    if (!body.payout_account_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "payout_account_id is required" }),
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
      .eq("vendor_id", vendorId) // Ensure ownership
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

    // 5. Verify account is in retryable status
    if (!["verification_failed", "pending_verification"].includes(existingAccount.status)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Cannot retry verification for account with status: ${existingAccount.status}`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // 6. Build updated data (use existing values if not provided)
    const businessName = body.business_name?.trim() || existingAccount.business_name;
    const bankCode = body.settlement_bank_code?.trim() || existingAccount.settlement_bank_code;
    const bankName = body.settlement_bank_name?.trim() || existingAccount.settlement_bank_name;
    const accountNumber = body.account_number?.trim() || existingAccount.account_number;

    // Validate account number format if provided
    if (body.account_number && !isValidNigerianAccountNumber(accountNumber)) {
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

    // 7. Update record with new details and reset to pending
    const { error: updateError } = await supabase
      .from("vendor_payout_accounts")
      .update({
        business_name: businessName,
        settlement_bank_code: bankCode,
        settlement_bank_name: bankName,
        account_number: accountNumber,
        status: "pending_verification",
        verification_error: null,
        verification_status: "retrying",
      })
      .eq("id", body.payout_account_id);

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

    // 8. Run verification using pluggable strategy
    const verificationContext: VerificationContext = {
      vendor_id: vendorId,
      provider: existingAccount.provider,
      business_name: businessName,
      settlement_bank_code: bankCode,
      account_number: accountNumber,
    };

    const strategy = getVerificationStrategy();
    const verificationResult = await verifyVendor(verificationContext, strategy);

    // 9. Handle verification result
    if (!verificationResult.verified) {
      await supabase
        .from("vendor_payout_accounts")
        .update({
          status: "verification_failed",
          verification_error: verificationResult.error,
          verification_status: "failed",
        })
        .eq("id", body.payout_account_id);

      return new Response(
        JSON.stringify({
          ok: false,
          error: verificationResult.error || "Verification failed",
          payout_account: {
            id: body.payout_account_id,
            status: "verification_failed",
            business_name: businessName,
            account_number: maskAccountNumber(accountNumber),
          },
          can_retry: true,
          retry_hint: verificationResult.retryHint,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 10. Verification passed - create Paystack subaccount
    const accountHolderName =
      (verificationResult.metadata?.account_name as string) || businessName;

    let paystackSubaccount;
    try {
      paystackSubaccount = await createPaystackSubaccount({
        business_name: businessName,
        settlement_bank: bankCode,
        account_number: accountNumber,
        percentage_charge: existingAccount.percentage_charge || 5,
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

      await supabase
        .from("vendor_payout_accounts")
        .update({
          status: "verification_failed",
          verification_error: message,
          verification_status: "subaccount_creation_failed",
        })
        .eq("id", body.payout_account_id);

      return new Response(
        JSON.stringify({
          ok: false,
          error: message,
          payout_account: {
            id: body.payout_account_id,
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

    // 11. Update record with verified status
    const { data: updatedAccount } = await supabase
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
      .eq("id", body.payout_account_id)
      .select()
      .single();

    // 12. Return success
    return new Response(
      JSON.stringify({
        ok: true,
        payout_account: {
          id: updatedAccount?.id || body.payout_account_id,
          status: "verified",
          business_name: businessName,
          account_number: maskAccountNumber(accountNumber),
          settlement_bank_name: bankName,
          provider_account_code: paystackSubaccount.data.subaccount_code,
          percentage_charge: existingAccount.percentage_charge,
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
    console.error("Unexpected error in retry-payout-verification:", error);
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
