/**
 * Resolve Bank Account Edge Function
 *
 * Uses Paystack API to resolve bank account details (account name).
 * Public endpoint (no auth required) for UX purposes.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyAccountNumber } from "../_shared/paystack.ts";

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

    // Get query params
    const url = new URL(req.url);
    const accountNumber = url.searchParams.get("account_number");
    const bankCode = url.searchParams.get("bank_code");

    // Validate required params
    if (!accountNumber || !bankCode) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "account_number and bank_code are required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate account number format (10 digits)
    if (!/^\d{10}$/.test(accountNumber)) {
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

    // Call Paystack API to resolve account
    try {
      const result = await verifyAccountNumber(accountNumber, bankCode);

      return new Response(
        JSON.stringify({
          ok: true,
          account_number: result.data.account_number,
          account_name: result.data.account_name,
          bank_id: result.data.bank_id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } catch (paystackError) {
      const message =
        paystackError instanceof Error
          ? paystackError.message
          : "Account resolution failed";

      return new Response(
        JSON.stringify({
          ok: false,
          error: message,
          details:
            "Could not resolve account. Please verify the account number and bank are correct.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Return 200 with error in body for better UX
        }
      );
    }
  } catch (error) {
    console.error("Unexpected error in resolve-bank-account:", error);
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
